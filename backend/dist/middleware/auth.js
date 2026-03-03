"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = authenticateJWT;
exports.requireRole = requireRole;
exports.generateToken = generateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config/config");
const errors_1 = require("../utils/errors");
function authenticateJWT(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        throw new errors_1.UnauthorizedError('No token provided');
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
        req.user = payload;
        next();
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new errors_1.UnauthorizedError('Token expired');
        }
        throw new errors_1.UnauthorizedError('Invalid token');
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        if (!roles.includes(req.user.role)) {
            throw new errors_1.ForbiddenError('Insufficient permissions for this operation');
        }
        next();
    };
}
function generateToken(payload) {
    return jsonwebtoken_1.default.sign(payload, config_1.config.jwt.secret, {
        expiresIn: config_1.config.jwt.expiresIn,
    });
}
//# sourceMappingURL=auth.js.map