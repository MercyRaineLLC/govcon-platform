// =============================================================
// Global Error Handler Middleware
// =============================================================
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Operational error', {
        message: err.message,
        code: err.code,
        path: req.path,
        method: req.method,
        stack: err.stack,
      });
    } else {
      logger.warn('Client error', {
        message: err.message,
        code: err.code,
        path: req.path,
        statusCode: err.statusCode,
      });
    }

    const response: ApiResponse = {
      success: false,
      error: err.message,
      code: err.code,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Unhandled / unexpected errors
  logger.error('Unhandled error', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  } as ApiResponse);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'ROUTE_NOT_FOUND',
  } as ApiResponse);
}
