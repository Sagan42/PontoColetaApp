import type { HttpResponse } from './http-types.js';

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  };
}

export function ok(data: unknown, meta?: Record<string, unknown>): HttpResponse {
  return json(200, meta ? { data, meta } : { data });
}

export function created(data: unknown, location?: string): HttpResponse {
  return json(201, { data }, location ? { location } : {});
}

export function accepted(): HttpResponse {
  return json(202, { data: { accepted: true } });
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): HttpResponse {
  const body: ErrorBody = { error: { code, message }, requestId };
  if (details !== undefined) body.error.details = details;
  return json(statusCode, body);
}
