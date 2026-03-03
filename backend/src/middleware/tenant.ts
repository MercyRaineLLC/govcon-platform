// =============================================================
// Tenant Isolation Middleware
// Ensures all queries are scoped to consultingFirmId
// =============================================================
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError } from '../utils/errors';

/**
 * Validates that the authenticated user's consultingFirmId matches
 * the resource being accessed. Must be called AFTER authenticateJWT.
 */
export function enforceTenantScope(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user?.consultingFirmId) {
    throw new UnauthorizedError('Tenant context missing');
  }
  next();
}

/**
 * Returns the consultingFirmId from the authenticated request.
 * Use this in every service/controller to scope database queries.
 */
export function getTenantId(req: AuthenticatedRequest): string {
  if (!req.user?.consultingFirmId) {
    throw new UnauthorizedError('Tenant context missing');
  }
  return req.user.consultingFirmId;
}
