// logging functionality

"use strict"
/* eslint-env node */
/* jslint node: true */

let logger = null

function configureLog(newLogger) {
    logger = newLogger
}

function getLogger() {
    return logger
}

// First arg can be any string of: error, warn, info, verbose, debug, and silly.
function log(level, ...args) {
    const logFunction = {
        error: logger.error,
        warn: logger.warn,
        info: logger.info,
        verbose: logger.debug,
        debug: logger.debug,
        silly: logger.trace,
        trace: logger.trace
    }[level]

    if (args.length <= 1) {
        logFunction.bind(logger)(args[0])
    } else {
        const message = []
        for (let i in args) {
            message.push(args[i])
        }
        logFunction.bind(logger)({message})
    }
}

module.exports = {
    configureLog,
    getLogger,
    log
}
