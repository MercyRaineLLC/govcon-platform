"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, _next) {
    if (err instanceof errors_1.AppError) {
        if (err.statusCode >= 500) {
            logger_1.logger.error('Operational error', {
                message: err.message,
                code: err.code,
                path: req.path,
                method: req.method,
                stack: err.stack,
            });
        }
        else {
            logger_1.logger.warn('Client error', {
                message: err.message,
                code: err.code,
                path: req.path,
                statusCode: err.statusCode,
            });
        }
        const response = {
            success: false,
            error: err.message,
            code: err.code,
        };
        res.status(err.statusCode).json(response);
        return;
    }
    // Unhandled / unexpected errors
    logger_1.logger.error('Unhandled error', {
        message: err.message,
        path: req.path,
        method: req.method,
        stack: err.stack,
    });
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
    });
}
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.path}`,
        code: 'ROUTE_NOT_FOUND',
    });
}
//# sourceMappingURL=errorHandler.js.map