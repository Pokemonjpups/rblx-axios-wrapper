let log = console.log;

const logger = {
    // Enums
    DebugLevel: {
        'Default': 0,
        'Errors': 10,
        'Warnings': 20,
        'Info': 30,
        'Debug': 100,
    },
    // Methods
    info: (...args) => {
        if (logLevel >= logger.DebugLevel.Info) {
            log('[rblx-axios-wrapper] [info]',...args);
        }
    },
    warn: (...args) => {
        if (logLevel >= logger.DebugLevel.Warnings) {
            log('[rblx-axios-wrapper] [warn]',...args);
        }
    },
    err: (...args) => {
        if (logLevel >= logger.DebugLevel.Errors) {
            log('[rblx-axios-wrapper] [err]',...args);
        }
    },
    setLevel: (newLevel) => {
        logLevel = newLevel;
    },
    getLevel: () => {
        return logLevel;
    },
}

let logLevel = logger.DebugLevel.Default;

module.exports = logger;