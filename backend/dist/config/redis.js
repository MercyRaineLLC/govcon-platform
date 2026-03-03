"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.connectRedis = connectRedis;
exports.disconnectRedis = disconnectRedis;
// =============================================================
// Redis Client
// =============================================================
const ioredis_1 = require("ioredis");
const config_1 = require("./config");
const logger_1 = require("../utils/logger");
exports.redis = new ioredis_1.Redis(config_1.config.redis.url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
});
exports.redis.on('connect', () => logger_1.logger.info('Redis connected'));
exports.redis.on('error', (err) => logger_1.logger.error('Redis error', { error: err.message }));
exports.redis.on('close', () => logger_1.logger.warn('Redis connection closed'));
async function connectRedis() {
    if (exports.redis.status === 'ready' || exports.redis.status === 'connecting') {
        return;
    }
    await exports.redis.connect();
}
async function disconnectRedis() {
    await exports.redis.quit();
    logger_1.logger.info('Redis disconnected');
}
//# sourceMappingURL=redis.js.map