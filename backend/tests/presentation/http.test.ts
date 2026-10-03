import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../src/shared/domain/errors/index.js';
import { AddressNotFoundError } from '../../src/modules/collection-points/domain/errors.js';
import {
  HttpAuthorizationError,
  MAX_BODY_BYTES,
  Router,
  ok,
  parseJsonBody,
  toHttpRequest,
  toHttpResponse,
} from '../../src/shared/presentation/http/index.js';
import type { HttpRequest } from '../../src/shared/presentation/http/index.js';
import { silentLogger } from '../support/fakes.js';

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    path: '/v1/health',
    query: {},
    headers: {},
    rawBody: null,
    requestId: 'req-1',
    correlationId: 'corr-1',
    claims: null,
    ...overrides,
  };
}

describe('Router', () => {
  it('matches path parameters', async () => {
    const router = new Router();
    router.get('/v1/collection-points/{id}', ({ params }) => ok({ id: params.id }));

    const response = await router.handle(makeRequest({ path: '/v1/collection-points/abc-123' }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: { id: 'abc-123' } });
  });

  it('prefers a literal segment registered before a parameter', async () => {
    const router = new Router();
    router.get('/v1/collection-points/nearby', () => ok({ route: 'nearby' }));
    router.get('/v1/collection-points/{id}', () => ok({ route: 'details' }));

    const response = await router.handle(makeRequest({ path: '/v1/collection-points/nearby' }));

    expect(JSON.parse(response.body)).toEqual({ data: { route: 'nearby' } });
  });

  it('decodes percent-encoded parameters', async () => {
    const router = new Router();
    router.get('/v1/materials/{slug}', ({ params }) => ok({ slug: params.slug }));

    const response = await router.handle(
      makeRequest({ path: '/v1/materials/oleo%20de%20cozinha' }),
    );

    expect(JSON.parse(response.body)).toEqual({ data: { slug: 'oleo de cozinha' } });
  });

  it('answers 405 when the path exists with another method', async () => {
    const router = new Router();
    router.get('/v1/health', () => ok({}));

    const response = await router.handle(makeRequest({ method: 'POST' }));
    expect(response.statusCode).toBe(405);
  });

  it('answers 404 for an unknown path', async () => {
    const response = await new Router().handle(makeRequest({ path: '/nope' }));
    expect(response.statusCode).toBe(404);
  });
});

describe('toHttpResponse', () => {
  it.each([
    [new ValidationError('inválido', 'name'), 400, 'VALIDATION_ERROR'],
    [new NotFoundError('não encontrado'), 404, 'NOT_FOUND'],
    [new AddressNotFoundError(), 404, 'ADDRESS_NOT_FOUND'],
    [new ConflictError('já existe'), 409, 'CONFLICT'],
    [new ExternalServiceError('indisponível', 'nominatim'), 503, 'EXTERNAL_SERVICE_ERROR'],
    [new HttpAuthorizationError(401, 'UNAUTHORIZED', 'sem token'), 401, 'UNAUTHORIZED'],
    [new HttpAuthorizationError(403, 'FORBIDDEN', 'sem permissão'), 403, 'FORBIDDEN'],
  ])('maps %s to the right status', (error, status, code) => {
    const response = toHttpResponse(error, makeRequest(), silentLogger);
    const body = JSON.parse(response.body) as { error: { code: string } };

    expect(response.statusCode).toBe(status);
    expect(body.error.code).toBe(code);
  });

  it('reports which field failed validation', () => {
    const response = toHttpResponse(
      new ValidationError('Informe um nome.', 'name'),
      makeRequest(),
      silentLogger,
    );

    const body = JSON.parse(response.body) as { error: { details: unknown } };
    expect(body.error.details).toEqual({ field: 'name' });
  });

  it('turns a schema error into 400 with per-field details', () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    const response = toHttpResponse(parsed.error, makeRequest(), silentLogger);
    const body = JSON.parse(response.body) as { error: { details: { field: string }[] } };

    expect(response.statusCode).toBe(400);
    expect(body.error.details[0]?.field).toBe('name');
  });

  it('never leaks internals of an unexpected error', () => {
    const response = toHttpResponse(
      new Error('connection string postgres://user:password@host'),
      makeRequest(),
      silentLogger,
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('password');
    expect(JSON.parse(response.body)).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir a operação. Tente novamente.',
      },
      requestId: 'req-1',
    });
  });
});

describe('parseJsonBody', () => {
  it('parses a JSON body', () => {
    expect(parseJsonBody(makeRequest({ rawBody: '{"a":1}' }))).toEqual({ a: 1 });
  });

  it('rejects an absent body', () => {
    expect(() => parseJsonBody(makeRequest({ rawBody: '   ' }))).toThrow(ValidationError);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseJsonBody(makeRequest({ rawBody: '{oops}' }))).toThrow(ValidationError);
  });

  it('rejects a payload over the limit before parsing it', () => {
    const oversized = JSON.stringify({ notes: 'a'.repeat(MAX_BODY_BYTES) });
    expect(() => parseJsonBody(makeRequest({ rawBody: oversized }))).toThrow(/tamanho máximo/);
  });
});

describe('toHttpRequest', () => {
  const baseEvent = {
    rawPath: '/v1/collection-points',
    headers: { 'X-Correlation-Id': 'corr-42', 'Content-Type': 'application/json' },
    queryStringParameters: { material: 'pilhas' },
    body: '{"name":"Ecoponto"}',
    isBase64Encoded: false,
    requestContext: {
      requestId: 'req-42',
      http: { method: 'post', path: '/v1/collection-points' },
      authorizer: { jwt: { claims: { sub: 'admin-1' } } },
    },
  };

  it('normalises method, headers and claims', () => {
    const request = toHttpRequest(baseEvent as never);

    expect(request.method).toBe('POST');
    expect(request.headers['x-correlation-id']).toBe('corr-42');
    expect(request.correlationId).toBe('corr-42');
    expect(request.requestId).toBe('req-42');
    expect(request.claims).toEqual({ sub: 'admin-1' });
    expect(request.query).toEqual({ material: 'pilhas' });
  });

  it('falls back to the request id when no correlation header is sent', () => {
    const request = toHttpRequest({ ...baseEvent, headers: {} } as never);
    expect(request.correlationId).toBe('req-42');
  });

  it('decodes a base64 body', () => {
    const request = toHttpRequest({
      ...baseEvent,
      body: Buffer.from('{"name":"Ecoponto"}', 'utf8').toString('base64'),
      isBase64Encoded: true,
    } as never);

    expect(request.rawBody).toBe('{"name":"Ecoponto"}');
  });
});
