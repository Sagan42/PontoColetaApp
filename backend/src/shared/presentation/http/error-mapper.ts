import { ZodError } from 'zod';
import type { Logger } from '../../application/ports/logger.js';
import { DomainError } from '../../domain/errors/index.js';
import type { HttpRequest, HttpResponse } from './http-types.js';
import { errorResponse } from './responses.js';

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  ADDRESS_NOT_FOUND: 404,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EXTERNAL_SERVICE_ERROR: 503,
};

export class HttpAuthorizationError extends Error {
  constructor(
    readonly statusCode: 401 | 403,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpAuthorizationError';
  }
}

export function toHttpResponse(error: unknown, request: HttpRequest, logger: Logger): HttpResponse {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return errorResponse(
      400,
      'VALIDATION_ERROR',
      'Dados inválidos na requisição.',
      request.requestId,
      details,
    );
  }

  if (error instanceof HttpAuthorizationError) {
    logger.warn('request.unauthorized', { status: error.statusCode, errorType: error.code });
    return errorResponse(error.statusCode, error.code, error.message, request.requestId);
  }

  if (error instanceof DomainError) {
    const statusCode = STATUS_BY_CODE[error.code] ?? 400;
    const details = 'field' in error && error.field ? { field: error.field } : undefined;

    logger.warn('request.rejected', { status: statusCode, errorType: error.code });
    return errorResponse(statusCode, error.code, error.message, request.requestId, details);
  }

  logger.error('request.failed', {
    status: 500,
    errorType: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'Não foi possível concluir a operação. Tente novamente.',
    request.requestId,
  );
}
