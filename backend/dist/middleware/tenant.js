"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceTenantScope = enforceTenantScope;
exports.getTenantId = getTenantId;
const errors_1 = require("../utils/errors");
/**
 * Validates that the authenticated user's consultingFirmId matches
 * the resource being accessed. Must be called AFTER authenticateJWT.
 */
function enforceTenantScope(req, _res, next) {
    if (!req.user?.consultingFirmId) {
        throw new errors_1.UnauthorizedError('Tenant context missing');
    }
    next();
}
/**
 * Returns the consultingFirmId from the authenticated request.
 * Use this in every service/controller to scope database queries.
 */
function getTenantId(req) {
    if (!req.user?.consultingFirmId) {
        throw new errors_1.UnauthorizedError('Tenant context missing');
    }
    return req.user.consultingFirmId;
}
//# sourceMappingURL=tenant.js.map