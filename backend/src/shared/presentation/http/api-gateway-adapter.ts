import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2WithRequestContext } from 'aws-lambda';
import { ValidationError } from '../../domain/errors/index.js';
import type { HttpMethod, HttpRequest } from './http-types.js';

export const MAX_BODY_BYTES = 16 * 1024;

interface JwtAuthorizerContext {
  jwt?: { claims?: Record<string, unknown> };
}

type ApiGatewayEvent = APIGatewayProxyEventV2WithRequestContext<{
  requestId: string;
  http: { method: string; path: string };
  authorizer?: JwtAuthorizerContext;
}>;

export function toHttpRequest(event: ApiGatewayEvent): HttpRequest {
  const headers = normalizeHeaders(event.headers ?? {});
  const requestId = event.requestContext.requestId || randomUUID();

  return {
    method: (event.requestContext.http.method.toUpperCase() as HttpMethod) ?? 'GET',
    path: event.rawPath || event.requestContext.http.path,
    query: event.queryStringParameters ?? {},
    headers,
    rawBody: decodeBody(event),
    requestId,
    correlationId: headers['x-correlation-id'] ?? requestId,
    claims: event.requestContext.authorizer?.jwt?.claims ?? null,
  };
}

function decodeBody(event: ApiGatewayEvent): string | null {
  if (event.body === undefined || event.body === null) return null;
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

function normalizeHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

export function parseJsonBody(request: HttpRequest): unknown {
  const body = request.rawBody;
  if (body === null || body.trim().length === 0) {
    throw new ValidationError('Corpo da requisição ausente.');
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    throw new ValidationError('Corpo da requisição excede o tamanho máximo permitido.');
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new ValidationError('Corpo da requisição não é um JSON válido.');
  }
}
