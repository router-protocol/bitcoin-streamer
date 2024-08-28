import winston from 'winston';

const APP_NAME = process.env.APP_NAME || 'BITCOIN_STREAMER'; // You might want to change the default app name to reflect your Bitcoin service
let LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Validate log level to ensure it's one of the Winston supported levels
if (!['error', 'warn', 'info', 'verbose', 'debug', 'silly'].includes(LOG_LEVEL)) {
    LOG_LEVEL = 'info';
}

const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            const date = new Date(timestamp);
            return `${date.toISOString()}|${level.toUpperCase().substring(0, 3)}|${APP_NAME}|${message}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(), // This adds color to the log levels for better readability in the console
                winston.format.simple() // This will output the log level, timestamp, and message
            ),
        }),
    ],
});

export default logger;
