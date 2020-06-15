let log = console.log;

let logLevel = logger.DebugLevel.Default;

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
        if (logLevel >= this.DebugLevel.Info) {
            log('[rblx-axios-wrapper] [info]',...args);
        }
    },
    warn: (...args) => {
        if (logLevel >= this.DebugLevel.Warnings) {
            log('[rblx-axios-wrapper] [warn]',...args);
        }
    },
    err: (...args) => {
        if (logLevel >= this.DebugLevel.Errors) {
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

module.exports = logger;