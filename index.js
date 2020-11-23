/// <reference path="index.d.ts" />

// libraries
const SocksProxyAgent = require('socks-proxy-agent');
const axiosLib = require('axios').default;
const sleep = require('util').promisify(setTimeout);
const _ = require('lodash');
const fs = require('fs');
const crypto = require('crypto');
const util = require('util');

/**
 * @typedef ExtendedAxiosInstanceProperties
 * @property {string} id
 * @property {string|undefined} cookie
 * @property {() => any|false} getProxy
 */

/**
 * @typedef {import('axios').AxiosInstance & ExtendedAxiosInstanceProperties} ExtendedAxiosInstance
 */

// log package
const logger = require('./logger');

let _proxyAgents = [];
/**
 * @type {ExtendedAxiosInstance}
 */
let _normalAgent;

let _captchaProvider = undefined;
let _maxPendingCaptchasAtOnce = 10;
let _pendingCaptchas = 0;
let publicKeys = [];
const getPublicKey = async (key) => {
    if (!publicKeys) {
        await backgroundTasks.updateCaptchaMetadata();
    }
    for (const item of publicKeys) {
        if (item.type === key) {
            return item.value;
        }
    }
}

let _disableCookieToCsrfMap = false;
/**
 * @type {Map<string, string>}
 */
const cookieToCsrfMap = new Map();

let _disableCookieToUserIdMap = false;
/**
 * @type {Map<string, number>}
 */
const cookieToUserIdMap = new Map();

let _failOnCodeErrors = false;

const { registerInterceptor } = require('axios-cached-dns-resolve');

const readFileAsync = util.promisify(fs.readFile);
/**
 * Setup an axiosinstance with the proper csrf/http code intersceptors
 * @param {import('axios').AxiosInstance} proxy 
 * @returns {void}
 */
const setupInterceptors = (proxy) => {
    //@ts-ignore
    if (proxy._setupByHttp) {
        return;
    }
    // @ts-ignore
    proxy._setupByHttp = true;
    // @ts-ignore
    proxy.id = crypto.randomBytes(32).toString('hex');
    registerInterceptor(proxy);

    let _lastUsedOkCsrf = 'null';
    proxy.interceptors.request.use(conf => {
        // @ts-ignore
        if (proxy.cookie) {
            if (typeof conf.headers['cookie'] !== 'string') {
                conf.headers['cookie'] = '';
            }
            // confirm we arent sending two cookies
            if (!conf.headers.cookie.match(/\.ROBLOSECURITY/g)) {
                // @ts-ignore
                conf.headers.cookie = '.ROBLOSECURITY=' + proxy.cookie + '; ' + conf.headers.cookie;
            }
        }
        if (!conf.headers['x-csrf-token']) {
            if (!_disableCookieToCsrfMap) {
                if (conf.headers['cookie'] && conf.headers.cookie.match(/\.ROBLOSECURITY=/g)) {
                    let _otherCsrfKey = conf.headers.cookie.match(/\.ROBLSECURITY=(.+?)(;|)/g);
                    let _otherCsrf = cookieToCsrfMap.get(_otherCsrfKey);
                    if (_otherCsrf) {
                        _lastUsedOkCsrf = _otherCsrf;
                    }

                }
            }
            conf.headers['x-csrf-token'] = _lastUsedOkCsrf;
        }
        return conf;
    })
    proxy.interceptors.response.use(undefined, err => {

        const captchaErrorTypes = [
            // Login v1/v2
            {
                urls: [
                    /^https:\/\/auth.roblox.com\/v(1|2)\/login$/g
                ],
                code: 2,
                message: 'You must pass the robot test before logging in.',
                keyName: 'WebLogin',
            },
            // Signup v1/v2/v3
            {
                urls: [
                    /^https:\/\/auth.roblox.com\/v(1|2|3)\/signup$/,
                ],
                code: 2,
                message: 'Captcha Failed.',
                keyName: 'WebSignup',
            },
            // Group join v1
            {
                urls: [
                    /^https:\/\/groups.roblox.com\/v1\/groups\/(\d+?)\/users$/,
                ],
                code: 5,
                message: 'You must pass the captcha test before joining this group.',
                keyName: 'UserAction',
            },
            // friend request v1
            {
                urls: [
                    /^https:\/\/friends.roblox.com\/v1\/users\/(\d+?)\/request-friendship$/,
                ],
                code: 14,
                message: 'The user has not passed the captcha.',
                keyName: 'UserAction',
            },
            // follow request v1
            {
                urls: [
                    /^https:\/\/friends.roblox.com\/v1\/users\/(\d+?)\/follow$/,
                ],
                code: 14,
                message: 'The user has not passed the captcha.',
                keyName: 'UserAction',
            }
        ]

        /**
        * @type {import('axios').AxiosError<{errors: any[]}>}
        */
        let e = err;
        if (e && e.config && e.config.data && typeof e.config.data === 'string') {
            logger.info('decoding request body to json. body is:', e.config.data);
            try {
                e.config.data = JSON.parse(e.config.data);
            } catch (e) {
                logger.err('could not decode json for request. data:', e.config.data, 'type:', typeof e.config.data);
            }
        }
        if (err && err.response) {
            if (err.response.status === 429) {
                logger.warn('got 429 error with request url', e.config.url, '. retrying in 5k ms.');
                /*
                return sleep(5000).then(() => {
                    return proxy.request(e.config)
                });
                */
                return sleep(2500).then(() => {
                    return http.client({
                        // @ts-ignore
                        useCookie: typeof proxy.cookie === 'string',
                        useProxy: true,
                    }).request(e.config);
                });
            } else if (err.response.status === 403) {
                for (const item of e.response.data.errors) {
                    for (const type of captchaErrorTypes) {
                        let _isMatch = false;
                        for (const urlType of type.urls) {
                            let _matchUrl = e.config.url;
                            if (_matchUrl.slice(_matchUrl.length - 1) === '/') {
                                _matchUrl = _matchUrl.slice(0, _matchUrl.length - 1);
                            }
                            if (_matchUrl.match(urlType)) {
                                _isMatch = true;
                            }
                        }
                        if (_isMatch) {
                            if (item.code === type.code && item.message.toLowerCase() === type.message.toLowerCase()) {
                                if (e && e.config && typeof e.config.data === 'undefined') {
                                    logger.info('converting undefined body to empty object.');
                                    e.config.data = {};
                                }
                                if (typeof e.config.data !== 'object') {
                                    throw new http.RequestBodyMustBeObject('The request body must be an object when a captcha is required. Request URL: ' + e.config.url + '. Method: ' + e.config.method + '. Body type: ' + typeof e.config.data)
                                }
                                logger.info('a captcha is required for request url', e.config.url, '. the message was: "', item.message, '". code:', item.code);
                                e.config.data['captchaProvider'] = 'PROVIDER_ARKOSE_LABS';
                                // temporary
                                if (_pendingCaptchas >= _maxPendingCaptchasAtOnce) {
                                    throw new Error('[temporary] Too many captchas at once.');
                                }
                                _pendingCaptchas++;
                                return getPublicKey(type.keyName).then(loginKey => {
                                    // @ts-ignore
                                    return _captchaProvider(loginKey, proxy.getProxy()).then(captchaToken => {
                                        logger.info('captcha finished. trying request');
                                        _pendingCaptchas--;
                                        e.config.data['captchaToken'] = captchaToken;
                                        return proxy.request(e.config)
                                    }).catch(err => {
                                        _pendingCaptchas--;
                                        throw err;
                                    })
                                })
                            }
                        }
                    }
                }
                let _csrf = err.response.headers['x-csrf-token'];
                if (_csrf) {
                    err.config.headers['x-csrf-token'] = _csrf;
                    _lastUsedOkCsrf = _csrf;
                    if (!_disableCookieToCsrfMap && err.config.headers.cookie) {
                        let _otherCsrfKey = err.config.headers.cookie.match(/\.ROBLSECURITY=(.+?)(;|)/g);
                        if (_otherCsrfKey) {
                            cookieToCsrfMap.set(_otherCsrfKey, _csrf);
                        }
                    }
                    return proxy.request(err.config);
                }
            }
        }
        return Promise.reject(err);
    });
}

const rblxAxiosWrapperStartup = () => {
    /**
     * @type {ExtendedAxiosInstance}
     */
    // @ts-ignore
    const generalAxiosAgent = axiosLib.create({});
    setupInterceptors(generalAxiosAgent);
    generalAxiosAgent.getProxy = () => {
        return false;
    }
    // @ts-ignore
    _normalAgent = generalAxiosAgent;
}
rblxAxiosWrapperStartup();

let _maxCaptchaSolveTime = Number.MAX_SAFE_INTEGER - 1;
const captchaProviders = {
    _userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4143.7 Safari/537.36',
    setUserAgent: (str) => {
        captchaProviders._userAgent = str;
    },
    setMaxSolveTime: (maxTime) => {
        _maxCaptchaSolveTime = maxTime;
    },
    antiCaptcha: (key, debug = false) => {
        const {
            AntiCaptcha,
            AntiCaptchaError,
            TaskTypes,
            ErrorCodes,
        } = require("anticaptcha");
        const AntiCaptchaAPI = new AntiCaptcha(key, debug); // You can pass true as second argument to enable debug logs.
        const antiCaptchaProvider = async (publicKey, proxyObject) => {
            // create task
            const taskId = await AntiCaptchaAPI.createTask({
                type: TaskTypes.FUN_CAPTCHA,
                websiteURL: 'https://www.roblox.com',
                websitePublicKey: publicKey,
                // funcaptchaApiJSSubdomain: '',
                proxyType: 'socks5',
                proxyAddress: proxyObject.proxyAddress,
                proxyPort: proxyObject.proxyPort,
                proxyLogin: proxyObject.proxyLogin,
                proxyPassword: proxyObject.proxyPassword,
                userAgent: captchaProviders._userAgent,
            });

            // Waiting for resolution and do something
            const response = await AntiCaptchaAPI.getTaskResult(taskId, _maxCaptchaSolveTime);
            let token = response.solution.token;
            return token;
        }
        return antiCaptchaProvider;
    }
}

/**
 * @type {Set<string>}
 */
let _cookieArray = new Set();

let _randomCookieIndex = 0;
const cookie = {
    EmptyPoolException: class extends Error { },
    add: (val) => {
        if (!Array.isArray(val)) {
            let cookieItem = val;
            val = [];
            val.push(cookieItem);
        }

        for (let cookie of val) {
            if (cookie.slice(0, '.ROBLOSECURITY='.length) === '.ROBLOSECURITY=') {
                cookie = cookie.slice('.ROBLOSECURITY='.length);
            }
            _cookieArray.add(cookie);
        }
    },
    addFromFile: async (fileName) => {
        let cookiesFile = (await readFileAsync(fileName)).toString();
        let cookies = cookiesFile.toString().replace(/\r/g, '').split('\n').filter(val => { return !val === false });
        http.cookie.add(cookies);
    },
    validatePool: async () => {
        let cookieChunk = _.chunk(Array.from(_cookieArray), 1000);
        for (const chunk of cookieChunk) {
            let proms = [];
            for (const cookie of chunk) {
                const handleCookie = async (cookie) => {
                    let cl = http.client({
                        useCookie: false,
                        useProxy: false,
                    });
                    cl.cookie = cookie;
                    try {
                        let res = await cl.get('https://users.roblox.com/v1/users/authenticated');
                        let id = res.data.id;
                        cookieToUserIdMap.set(cookie, id);
                    } catch (err) {
                        let code = err.code;
                        if (err && err.response.status) {
                            code = err.response.status;
                        }
                        logger.warn('invalid cookie detected. code:', code);
                        // console.log(err);
                        // todo: analyize performance implications of this
                        _cookieArray = new Set(Array.from(_cookieArray).filter(val => {
                            return val !== cookie;
                        }));
                    }
                }
                proms.push(handleCookie(cookie));
            }
            await Promise.all(proms);
        }
    },
    get: () => {
        let _cookieSetAsArray = Array.from(_cookieArray);
        let cookieToGrab = _cookieSetAsArray[_randomCookieIndex];
        if (typeof cookieToGrab !== 'string') {
            _randomCookieIndex = 0;
            logger.info('current cookie pool index(', _randomAxiosIndex, ') was empty. restarting index at 0');
            let firstVal = _cookieSetAsArray[0];
            if (typeof firstVal !== 'string') {
                throw new cookie.EmptyPoolException('The cookie pool is empty! Register cookies with cookie.add()');
            }
            return firstVal;
        } else {
            _randomCookieIndex++;
            return cookieToGrab;
        }
    },
    getPool: () => {
        return _cookieArray;
    },
}


let _clientIdsWaitingForOK = [];

let _randomAxiosIndex = 0;
const http = {
    // Errors
    ClientIsNotAProxyException: class extends Error { },
    NoProxiesAvailableException: class extends Error { },
    RequestBodyMustBeObject: class extends Error { },
    // Enums
    ReasonForClientMarkedAsBad: {
        'RequestTimeout': 1,
        'DoNotReAddToPool': 2,
    },
    DebugLevel: logger.DebugLevel,
    // Extra Objects
    captchaProviders: captchaProviders,
    // Cookie class
    cookie: cookie,
    setDebug: (level) => {
        logger.setLevel(level);
    },
    getDebug: () => {
        return logger.getLevel;
    },
    // Methods
    registerProxies: (proxyArr) => {
        if (!Array.isArray(proxyArr)) {
            let agentToInsert = proxyArr;
            proxyArr = [];
            proxyArr.push(agentToInsert);
        }
        for (const proxy of proxyArr) {
            const httpsAgent = SocksProxyAgent({
                password: proxy.proxyPassword,
                userId: proxy.proxyLogin,
                host: proxy.proxyAddress,
                port: proxy.proxyPort,
            });
            const axios = axiosLib.create({
                httpsAgent: httpsAgent,
            });
            setupInterceptors(axios);
            // @ts-ignore
            axios.getProxy = () => {
                return proxy;
            }
            _proxyAgents.push(axios);
        }
    },
    validateClients: async () => {
        let allClients = _proxyAgents;
        let proms = [];
        for (const agent of allClients) {
            const processAgent = async () => {
                // This is a bit weird, but it allows us to easily process the response without Promise.all() failing due to a failed request
                await agent.get('https://www.roblox.com/robots.txt').then(result => {
                    // Client is OK
                }).catch(err => {
                    // Client is BAD
                    http.badClient(agent);
                })
            }
            proms.push(processAgent());
        }
        await Promise.all(proms);
    },
    getProxyAgents: () => {
        return _proxyAgents;
    },
    client: (options = undefined) => {
        // Grab an agent from the proxy pool
        /**
         * @type {ExtendedAxiosInstance}
         */
        let axiosInstanceToGrab = _proxyAgents[_randomAxiosIndex];
        if (options) {
            if (options.useProxy === false) {
                axiosInstanceToGrab = _normalAgent;
            }
            if (options.onlyProxy && _proxyAgents.length === 0) {
                throw new http.NoProxiesAvailableException('Proxy pool is empty. Please register proxies with http.registerProxies()');
            }
        }
        if (!axiosInstanceToGrab) {
            _randomAxiosIndex = 0;
            let first = _proxyAgents[0];
            if (!first) {
                axiosInstanceToGrab = _normalAgent;
            } else {
                axiosInstanceToGrab = first;
            }
        } else {
            _randomAxiosIndex++;
        }
        // register an intersceptor
        axiosInstanceToGrab.interceptors.response.use(undefined, _err => {
            /**
             * @type {import('axios').AxiosError}
             */
            let e = _err;
            let msg = e.message.toLowerCase();
            // Check if there is an issue with the proxy
            if (msg.indexOf('socks5') !== -1 || msg.indexOf('proxy') !== -1 || msg.indexOf('socks') !== -1) {
                logger.warn('client with id', axiosInstanceToGrab.id, 'is bad. it is being removed from the pool and this request is being retried.', 'url:', e.config.url, 'method:', e.config.method, 'data?:', e.config.data);
                // The proxy is bad. Put it on a timeout, then try again with a new client
                http.badClient(axiosInstanceToGrab);
                return http.client(options).request(_err.config);
            }
            // Check if there is an issue that cannot be solved by the library
            if (e.code && !_failOnCodeErrors) {
                logger.err('got an', e.code, 'error while making a request. url:', e.config.url, 'method:', e.config.method, 'data?:', e.config.data);
                // auto-retry until OK
                return axiosInstanceToGrab.request(e.config);
            }

            return Promise.reject(e);
        })
        if (options && options.useCookie) {
            axiosInstanceToGrab.defaults.headers['cookie'] = '.ROBLOSECURITY=' + cookie.get();
        }
        return axiosInstanceToGrab;
    },
    badClient: (client, reason) => {
        if (!client.getProxy()) {
            // Not a proxy
            throw new http.ClientIsNotAProxyException('Non-proxy clients cannot be marked as bad.');
        } else {
            let id = client.id;
            if (_clientIdsWaitingForOK.includes(id)) {
                return;
            }
            _clientIdsWaitingForOK.push(id);
            _proxyAgents = _proxyAgents.filter(el => {
                return el.id !== id;
            });
            if (reason === http.ReasonForClientMarkedAsBad.DoNotReAddToPool) {
                return; // dont try re-adding
            }
            let _clientRequestPending = false;
            let _retryInterval = setInterval(() => {
                // small debounce check incase timeout
                if (_clientRequestPending) {
                    return;
                }
                // See if the client is OK
                client.get('https://www.roblox.com/robots.txt').then(res => {
                    if (res && res.status && res.status === 200) {
                        logger.info('client with id', id, 'is now ok. adding back to proxy pool');
                        _clientIdsWaitingForOK = _clientIdsWaitingForOK.filter(val => {
                            return val !== id;
                        });
                        // Client seems to be OK
                        _proxyAgents.push(client);
                        clearInterval(_retryInterval);
                    }
                }).catch(err => {
                    // Client is still bad.
                    let code = err.code;
                    if (err.response && err.response.status) {
                        code = err.response.status;
                    }
                    if (!code) {
                        code = err.message; // last resort...
                    }
                    logger.warn('client with id', id, 'is still bad. got this error:', code);
                }).finally(() => {
                    _clientRequestPending = false;
                });
            }, 60000);
        }
    },
    disableMap: (option) => {
        if (option === 'csrf') {
            _disableCookieToCsrfMap = true;
        } else if (option === 'userId') {
            _disableCookieToUserIdMap = true;
        } else if (option === 'all') {
            _disableCookieToCsrfMap = true;
            _disableCookieToUserIdMap = true;
        }
    },
    failOnCodeErrors: (bool) => {
        _failOnCodeErrors = bool;
    },
    // Captcha methods
    setCaptchaProvider: (provider) => {
        _captchaProvider = provider;
    },
    setCaptchaAsyncLimit: (limit) => {
        _maxPendingCaptchasAtOnce = limit;
    },
    addProxiesFromFile: async (proxyFileDir) => {
        let proxiesFile = (await readFileAsync(proxyFileDir)).toString();
        let proxies = proxiesFile.toString().replace(/\r/g, '').split('\n').filter(val => { return !val === false });
        let proxyObjectArr = [];
        for (const proxy of proxies) {
            let data = proxy.split(':');
            let ip = data[0];
            let port = data[1];
            let user = data[2];
            let pass = data[3];
            let obj = {
                proxyAddress: ip,
                proxyPort: port,
                proxyLogin: user,
                proxyPassword: pass,
            };
            proxyObjectArr.push(obj);
        }
        http.registerProxies(proxyObjectArr);
    },
}
module.exports = http;

const backgroundTasks = {
    main: () => {
        backgroundTasks.updateCaptchaMetadata();
        setInterval(() => {
            backgroundTasks.updateCaptchaMetadata();
        }, 60 * 1000);
    },
    updateCaptchaMetadata: () => {
        return http.client({}).get('https://captcha.roblox.com/v1/captcha/metadata').then(res => {
            publicKeys = res.data.funCaptchaPublicKeys;
        }).catch(err => {
            if (logger.getLevel() >= logger.DebugLevel.Warnings) {
                logger.warn('Could not get captcha keys metadata', err);
            }
        });
    },
}

// Run BG tasks
backgroundTasks.main();