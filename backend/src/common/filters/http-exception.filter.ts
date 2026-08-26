import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number = 400, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  let statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
  let message = err.message || 'Something went wrong on our side. Please try again later.';

  // Sanitize and translate PostgreSQL / system errors into user-friendly messages
  if (err.code === '23505' || message.toLowerCase().includes('duplicate key') || message.toLowerCase().includes('already exists')) {
    statusCode = 409;
    message = 'A record or identifier with these details already exists in the system.';
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'The referenced related record could not be found or is currently in use.';
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid data format or identifier provided in the request.';
  } else if (err.code === 'ECONNREFUSED' || message.toLowerCase().includes('database connection')) {
    statusCode = 503;
    message = 'Database connection temporarily unavailable. Please try again shortly.';
  } else if (statusCode === 401 && !err.message) {
    message = 'Authentication required. Please sign in.';
  } else if (statusCode === 403 && (!err.message || err.message.toLowerCase().includes('forbidden'))) {
    message = 'You do not have permission to access this page.';
  } else if (statusCode === 404 && !err.message) {
    message = 'Requested resource not found.';
  } else if (statusCode === 500) {
    message = 'Something went wrong on our side. Please try again later.';
  }

  // Developer logging on server console
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] ${req.method} ${req.originalUrl} - HTTP ${statusCode}: ${err.message || message}`);
  if (err.stack && statusCode >= 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    details: err.details || null,
    timestamp,
    path: req.originalUrl,
  });
}
