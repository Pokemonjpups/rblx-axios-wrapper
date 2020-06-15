import { AxiosInstance } from "axios";

interface ExtendedAxiosInstance extends AxiosInstance {
    /**
     * If this is true, this client was setup by http.ts. Otherwise, it is likely a plain axios instance or something went wrong during the setup phase.
     */
    _setupByHttp: boolean;
    /**
     * A unique indentifer for the proxy used to organize the proxy pool.
     */
    id: string;

    /**
     * Get the Proxy Data related to the client.
     * This will be false if the {ExtendedAxiosInstance} is not using a proxy.
     */
    getProxy: () => IProxyObject | false;

    /**
     * The ".ROBLOSECURITY" cookie
     */
    cookie?: string;
}

interface ExtendedAxiosInstanceWithCookie extends ExtendedAxiosInstance {
    cookie: string;
}

/**
 * A socks5 proxy object.
 */
interface IProxyObject {
    /**
     * The password of the proxy
     */
    proxyPassword?: string;
    /**
     * The username of the proxy
     */
    proxyLogin?: string;
    /**
     * The IP address of the proxy. Do not include the port.
     */
    proxyAddress: string;
    /**
     * The port of the proxy
     */
    proxyPort: string;
}

interface IClientOptions {
    /**
     * Only use proxy clients?
     */
    onlyProxy?: boolean;
    /**
     * Use a cookie from the cookie pool in the request?
     */
    useCookie?: boolean;
    /**
     * Use a proxy? Defaults to true
     */
    useProxy?: boolean;
}

// Enums
/**
 * The reason for why the HTTP client was marked as bad. Some reasons will disable the client forever, while others will re-check until it is alive again.
 */
export enum ReasonForClientMarkedAsBad {
    'RequestTimeout' = 1,
    /**
     * If the client just cannot be used whatsoever, use this to tell http.js not to re-add it to the pool
     */
    'DoNotReAddToPool' = 2,
}

/**
 * This exception is thrown when a method requires an agent with a proxy, but an agent without a proxy was provided.
 */
export class ClientIsNotAProxyException extends Error {}
/**
 * This exception is thrown when a proxy is required but no proxies are available
 */
export class NoProxiesAvailableException extends Error {}

export enum DebugLevel {
    /**
     * Only severe errors will be logged
     */
    'Default' = 0,
    /**
     * Only errors will be logged
     */
    'Errors' = 10,
    /**
     * Only warnings (and below) will be logged
     */
    'Warnings' = 20,
    /**
     * Function calls, http requests, etc, will be logged to the console
     */
    'Info' = 30,
    /**
     * Excessive logging. Will probably only be useful to those experience very strange issues, or those submitting PRs
     */
    'Debug' = 100,
}

/**
 * Set the debug level. Useful if promises aren't resolving (for example)
 * @param debugLevel 
 */
export function setDebug(debugLevel: DebugLevel): void;

/**
 * Get the current debug level
 */
export function getDebug(): number;

/**
 * Validate all clients in the pool. This will remove any bad clients.
 */
export function validateClients(): Promise<void>

/**
 * Register an array of proxies (or one proxy) into the proxy pool
 * @param proxyArr 
 */
export function registerProxies(proxyArr: IProxyObject[] | IProxyObject): void;
/**
 * Get a Client from the proxy pool.
 */
// TODO: If options.useCookie === true, then return type is ExtendedAxiosInstanceWithCookie. Otherwise, return type is ExtendedAxiosInstance
export function client<ClientOptions>(options?: IClientOptions): ExtendedAxiosInstance;

/**
 * Report a client as bad. This is normally handled automatically, but you may still need this method in some situations.
 * @param client The client **MUST** be a proxy client (i.e. client.getProxy() must NOT return "false")
 */
export function badClient(client: ExtendedAxiosInstance, reason?: ReasonForClientMarkedAsBad): void;

type MapDisableOption = "userId" | "csrf" | "all";
/**
 * Disable a map type. This can be useful if you run into memory overflow issues (when using thousands of cookies)
 * @param option The map type to disable.
 */
export function disableMap(option: MapDisableOption): void;

/**
 * Set the provider for captcha tokens.
 * 
 * If you are using antiCaptcha, you can use the method returned from {http.captchaProvider.antiCaptcha()}. 
 * 
 * If you need to build a custom solution, the {provider} parameter must be a method that takes two arguments (the first being the public key, and the second being a proxy object). The function you make must return a promise that resolves with the funcaptcha token
 * @param token 
 */
export function setCaptchaProvider(provider: (arg1: string, arg2: IProxyObject) => Promise<string>): void;

/**
 * Set the limit for captchas. This means that, there will never be more than {limit} number of captchas running at once. 
 * 
 * This can help prevent issues like a random surge in captcha requests (either intentional or accidental), preventing you from accidentally requesting 1000 captchas at once, however, the lower this limit is, the slower captcha solving will be.
 * 
 * The default limit is 10.
 * @param limit 
 */
export function setCaptchaAsyncLimit(limit: number): void;

/**
 * This is useful for debugging dev stuff but should be kept disabled in production-type scenerios.
 * 
 * When set to true, if an e.code error is encountered (econnreset, etimedout, econnaborted, etc), the request will fail. If set to false, the request will be repeatedly retried until it succeeds. Defaults to false
 * @param bool 
 */
export function failOnCodeErrors(bool: boolean): void;

/**
 * Add socks5 proxies to the pool from the provided {fileName}
 * 
 * The format of the proxy file is expected to be:
 * `ipAddress:port:username:pass`, with each entry seperated by "\n" or "\r\n"
 * 
 * (username and pass are optional)
 * @param fileName 
 */
export function addProxiesFromFile(fileName: string): Promise<void>

/**
 * The default captcha providers included with this library.
 */
export namespace captchaProviders {
    /**
     * This is a provider method used for http.setCaptchaProvider()
     * @param key Provide your antiCaptcha private key here
     */
    export function antiCaptcha(key: string): (publicKey: string, proxyData: IProxyObject) => Promise<string>

    /**
     * Set the max solve time for the default captcha providers (in MS). 
     * 
     * **You should probably *not* set this unless you are specifically OK with requests failing due to slow captcha solving times (note: most captcha solving providers will still charge for timed out captchas).**
     * 
     * Defaults to Number.MAX_SAFE_INTEGER - 1
     * @param ms 
     */
    export function setMaxSolveTime(ms: number): void;
}

/**
 * Cookie pooling library. Useful for botting purposes
 */
export namespace cookie {
    /**
     * This exception is thrown when a method requiring at least one cookie in the pool is called when the pool is empty
     */
    export class EmptyPoolException extends Error {}
    /**
     * Add a cooke (or array of cookies) to the cookie pool
     * 
     * If the cookie is prefixed with ".ROBLOESECURITY=", that part will be sliced off
     * @param cookie 
     */
    export function add(cookie: string | string[]): void;

    /**
     * Add cookies from the specified file path to the cookie pool.
     * 
     * This method expects each cookie in the file to be seperated by "\n" or "\r\n"
     * @param fileName 
     */
    export function addFromFile(fileName: string): Promise<void>;

    /**
     * Validate all cookies in the cookie pool and remove invalid ones. 
     * 
     * This will also set the cookieToId map objects
     */
    export function validatePool(): Promise<void>;

    /**
     * Get a random cookie from the pool
     */
    export function get(): string;

    /**
     * Get a mutatable object containing the pool of cookies
     */
    export function getPool(): Set<string>;
}