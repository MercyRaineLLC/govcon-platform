"use strict";
// =============================================================
// GovCon Advisory Intelligence Platform
// Production-Grade Express Server
// =============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("./config/config");
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const scoringWorker_1 = require("./workers/scoringWorker");
const enrichmentWorker_1 = require("./workers/enrichmentWorker");
// Route imports
const auth_1 = __importDefault(require("./routes/auth"));
const opportunities_1 = __importDefault(require("./routes/opportunities"));
const clients_1 = __importDefault(require("./routes/clients"));
const submissions_1 = __importDefault(require("./routes/submissions"));
const penalties_1 = __importDefault(require("./routes/penalties"));
const firm_1 = __importDefault(require("./routes/firm"));
const decision_1 = __importDefault(require("./routes/decision"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const documents_1 = __importDefault(require("./routes/documents"));
const docRequirements_1 = __importDefault(require("./routes/docRequirements"));
const clientPortal_1 = __importDefault(require("./routes/clientPortal"));
const rewards_1 = __importDefault(require("./routes/rewards"));
const templates_1 = __importDefault(require("./routes/templates"));
const clientDocuments_1 = __importDefault(require("./routes/clientDocuments"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const complianceMatrix_1 = __importDefault(require("./routes/complianceMatrix"));
async function bootstrap() {
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    // -------------------------------------------------------------
    // Security Middleware
    // -------------------------------------------------------------
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: config_1.config.isProduction,
        hsts: config_1.config.isProduction,
    }));
    app.use((0, cors_1.default)({
        origin: (origin, cb) => {
            if (!config_1.config.isProduction) {
                cb(null, true);
                return;
            }
            const allowed = (process.env.ALLOWED_ORIGINS || '')
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean);
            if (!origin || allowed.includes(origin)) {
                cb(null, true);
                return;
            }
            cb(new Error('Origin not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    app.use((0, express_rate_limit_1.default)({
        windowMs: config_1.config.rateLimit.windowMs,
        max: config_1.config.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: 'Too many requests',
            code: 'RATE_LIMITED',
        },
    }));
    // -------------------------------------------------------------
    // Parsing Middleware
    // -------------------------------------------------------------
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // -------------------------------------------------------------
    // Request Logging
    // -------------------------------------------------------------
    app.use((0, morgan_1.default)('combined', {
        stream: { write: (message) => logger_1.logger.http(message.trim()) },
        skip: (req) => req.url === '/health',
    }));
    // -------------------------------------------------------------
    // Health Check
    // -------------------------------------------------------------
    app.get('/health', (_req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            environment: config_1.config.env,
        });
    });
    // -------------------------------------------------------------
    // API Router
    // -------------------------------------------------------------
    const apiRouter = express_1.default.Router();
    apiRouter.use('/auth', auth_1.default);
    apiRouter.use('/opportunities', opportunities_1.default);
    apiRouter.use('/clients', clients_1.default);
    apiRouter.use('/submissions', submissions_1.default);
    apiRouter.use('/penalties', penalties_1.default);
    apiRouter.use('/firm', firm_1.default);
    apiRouter.use('/decision', decision_1.default);
    apiRouter.use('/jobs', jobs_1.default);
    apiRouter.use('/documents', documents_1.default);
    apiRouter.use('/doc-requirements', docRequirements_1.default);
    apiRouter.use('/client-portal', clientPortal_1.default);
    apiRouter.use('/rewards', rewards_1.default);
    apiRouter.use('/templates', templates_1.default);
    apiRouter.use('/client-documents', clientDocuments_1.default);
    apiRouter.use('/analytics', analytics_1.default);
    apiRouter.use('/compliance-matrix', complianceMatrix_1.default);
    app.use('/api', apiRouter);
    // -------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    // -------------------------------------------------------------
    // Infrastructure Connections
    // -------------------------------------------------------------
    await (0, database_1.connectDatabase)();
    await (0, redis_1.connectRedis)();
    const scoringWorker = (0, scoringWorker_1.startScoringWorker)();
    const enrichmentWorker = (0, enrichmentWorker_1.startEnrichmentWorker)();
    // -------------------------------------------------------------
    // Start HTTP Server
    // -------------------------------------------------------------
    const server = app.listen(config_1.config.port, () => {
        logger_1.logger.info('GovCon Platform server running', {
            port: config_1.config.port,
            environment: config_1.config.env,
            pid: process.pid,
        });
    });
    // -------------------------------------------------------------
    // Graceful Shutdown
    // -------------------------------------------------------------
    const shutdown = async (signal) => {
        logger_1.logger.info(`${signal} received. Shutting down gracefully...`);
        server.close(async () => {
            logger_1.logger.info('HTTP server closed');
            await scoringWorker.close();
            await enrichmentWorker.close();
            logger_1.logger.info('Workers stopped');
            await (0, database_1.disconnectDatabase)();
            await (0, redis_1.disconnectRedis)();
            logger_1.logger.info('Shutdown complete');
            process.exit(0);
        });
        setTimeout(() => {
            logger_1.logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 15000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
        logger_1.logger.error('Unhandled promise rejection', { reason });
    });
    process.on('uncaughtException', (err) => {
        logger_1.logger.error('Uncaught exception', {
            error: err.message,
            stack: err.stack,
        });
        process.exit(1);
    });
}
bootstrap().catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map