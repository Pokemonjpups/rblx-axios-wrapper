# rblx-axios-wrapper
A light unofficial wrapper around axios for use with Roblox web endpoints

---

## Features
- Automatic CSRF handling -- Including CSRF caching (to try to make it as efficient as possible)
- Socks5 Proxy Support (with pooling)
- Cookie Pooling (for botting purposes)
- Anticaptcha Support (although you can easily register your own captcha provider)

## Install
`npm i rblx-axios-wrapper`

## Usage

Grab the robots.txt file from Roblox:
```js
// Require the package
const rbx = require('rblx-axios-wrapper');
// Get a client
const client = rbx.client();
// Make a get request to roblox.com/robots.txt
client.get('https://www.roblox.com/robots.txt').then(data => {
    console.log('Robots File!',data.data);
})
```

It is expected that every time you wish to make an HTTP request, you will grab a new client. This is so that if you are using proxies or a cookie pool or whatever, a new cookie/proxy is grabbed each time.

---

## Examples

**Register a Proxy, add your anti captcha key, add a cookie to the pool, and join a group**
```js
// Require the library
const http = require('rblx-axios-wrapper');
// For dev purposes, you can set this to true, howevever, you should set this to "false" in a production env.
http.failOnCodeErrors(true);
// Create a proxy object
const proxy = {
    proxyAddress: '192.168.1.1',
    proxyPort: '12345',
    proxyLogin: 'username',
    proxyPassword: 'password1234',
}
// Register your proxy to the pool
http.registerProxies(proxy);
// Setup a captcha provider
http.setCaptchaProvider(
    // Provide one argument, the supplied antiCaptcha provider
    http.captchaProviders.antiCaptcha('1234private-key-here1234')
);
// Replace this with the ID of the group to join
const groupId = 1;
/**
 * Method to join a group
 * @returns {Promise<void>}
 */
const joinGroup = async () => {
    let client = http.client({
        // Setting this to true will make the client grab a random cookie from the pool before requests are issued.
        // All requests made with this specific client will always use the same cookie and same proxy (if applicable)
        useCookie: true,

        // Force a proxy from the pool to be used
        // This is because proxies are required when you use a captcha solver.
        // (Normally, there is a small chance your client may not be using a proxy due to how the pooling works. If you force a proxy to be used with the "onlyProxy: true" option, it is guaranteed your request will use a proxy)
        onlyProxy: true,
    });

    let data = await client.post(`https://groups.roblox.com/v1/groups/${groupId}/users`, {});
    // Should console.log(): "{}"
    console.log(data.data);
}
// Add a cookie to the cookie pool. Note that the ".ROBLOSECURITY=" part is not required
http.cookie.add('.ROBLOSECURITY=_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_1234 ... etc ...');

// Main function
const main = async () => {
    // validate the pool (remove invalid cookies)
    await http.cookie.validatePool();
    // join the group wtih a random cookie
    await joinGroup();
}
main();
```