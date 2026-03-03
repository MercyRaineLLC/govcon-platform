"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
// =============================================================
// Prisma Client Singleton
// =============================================================
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
exports.prisma = global.__prisma ||
    new client_1.PrismaClient({
        log: [
            { level: 'query', emit: 'event' },
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
        ],
    });
if (process.env.NODE_ENV !== 'production') {
    global.__prisma = exports.prisma;
    // Log slow queries in development
    exports.prisma.$on('query', (e) => {
        if (e.duration > 500) {
            logger_1.logger.warn('Slow query detected', { duration: e.duration, query: e.query });
        }
    });
}
exports.prisma.$on('error', (e) => {
    logger_1.logger.error('Prisma error', { message: e.message });
});
async function connectDatabase() {
    await exports.prisma.$connect();
    logger_1.logger.info('Database connected');
}
async function disconnectDatabase() {
    await exports.prisma.$disconnect();
    logger_1.logger.info('Database disconnected');
}
//# sourceMappingURL=database.js.map