import { beforeEach, describe, expect, it } from 'vitest';
import { ANONYMOUS_AUTHOR } from '../../src/modules/feedback/domain/feedback.js';
import { buildTestApi, type TestApi } from '../support/test-api.js';

describe('POST /v1/feedback', () => {
  let api: TestApi;

  beforeEach(() => {
    api = buildTestApi();
  });

  it('accepts a named feedback', async () => {
    const response = await api.request('POST', '/v1/feedback', {
      body: { name: 'Pedro', message: 'Faltou o ponto do bairro Cafezal.' },
    });

    expect(response.statusCode).toBe(201);
    expect(api.feedbackRepository.saved).toHaveLength(1);
    expect(api.feedbackRepository.saved[0]?.author).toBe('Pedro');
    expect(api.feedbackRepository.saved[0]?.message).toBe('Faltou o ponto do bairro Cafezal.');
  });

  it('records when the feedback was submitted', async () => {
    await api.request('POST', '/v1/feedback', { body: { message: 'Muito útil, obrigado.' } });

    expect(api.feedbackRepository.saved[0]?.submittedAt).toEqual(
      new Date('2026-08-22T12:00:00.000Z'),
    );
  });

  it('stores an unnamed feedback as anonymous', async () => {
    await api.request('POST', '/v1/feedback', { body: { message: 'Muito útil, obrigado.' } });

    expect(api.feedbackRepository.saved[0]?.author).toBe(ANONYMOUS_AUTHOR);
  });

  it('treats an empty name as anonymous', async () => {
    await api.request('POST', '/v1/feedback', {
      body: { name: '   ', message: 'Muito útil, obrigado.' },
    });

    expect(api.feedbackRepository.saved[0]?.author).toBe(ANONYMOUS_AUTHOR);
  });

  it('does not echo the message back', async () => {
    const response = await api.request('POST', '/v1/feedback', {
      body: { message: 'Muito útil, obrigado.' },
    });

    expect(JSON.stringify(response.body)).not.toContain('obrigado');
  });

  it('rejects a feedback without a message', async () => {
    const response = await api.request('POST', '/v1/feedback', { body: { name: 'Pedro' } });

    expect(response.statusCode).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    expect(api.feedbackRepository.saved).toHaveLength(0);
  });

  it('rejects a message over the limit', async () => {
    const response = await api.request('POST', '/v1/feedback', {
      body: { message: 'a'.repeat(1001) },
    });

    expect(response.statusCode).toBe(400);
    expect(api.feedbackRepository.saved).toHaveLength(0);
  });

  it('rejects a name over the limit', async () => {
    const response = await api.request('POST', '/v1/feedback', {
      body: { name: 'a'.repeat(61), message: 'Mensagem válida.' },
    });

    expect(response.statusCode).toBe(400);
    expect(api.feedbackRepository.saved).toHaveLength(0);
  });

  it('rejects a body that is not an object', async () => {
    const response = await api.request('POST', '/v1/feedback', { body: 'mensagem solta' });

    expect(response.statusCode).toBe(400);
    expect(api.feedbackRepository.saved).toHaveLength(0);
  });

  it('rejects a missing body', async () => {
    const response = await api.request('POST', '/v1/feedback');

    expect(response.statusCode).toBe(400);
    expect(api.feedbackRepository.saved).toHaveLength(0);
  });

  it('ignores fields the client invented', async () => {
    await api.request('POST', '/v1/feedback', {
      body: {
        message: 'Mensagem válida.',
        submittedAt: '1999-01-01T00:00:00.000Z',
        author: 'Administrador',
        id: 'escolhido-pelo-cliente',
      },
    });

    const saved = api.feedbackRepository.saved[0];
    expect(saved?.author).toBe(ANONYMOUS_AUTHOR);
    expect(saved?.id).toBe('feedback-1');
    expect(saved?.submittedAt).toEqual(new Date('2026-08-22T12:00:00.000Z'));
  });

  it('never logs the content of the feedback', async () => {
    await api.request('POST', '/v1/feedback', {
      body: { name: 'Pedro', message: 'Segredo que não deve aparecer em log.' },
    });

    const logged = JSON.stringify(api.logs);
    expect(logged).not.toContain('Segredo');
    expect(logged).not.toContain('Pedro');
  });

  it('answers 405 to a method the route does not serve', async () => {
    const response = await api.request('GET', '/v1/feedback');

    expect(response.statusCode).toBe(405);
  });

  it('has no public route to read feedback back', async () => {
    const response = await api.request('GET', '/v1/feedbacks');

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /v1/admin/feedback', () => {
  const admin = { sub: 'admin-1', email: 'admin@pontocoleta.app' };

  let api: TestApi;

  beforeEach(async () => {
    api = buildTestApi();

    await api.request('POST', '/v1/feedback', {
      body: { name: 'Pedro', message: 'Primeiro feedback.' },
    });
    await api.request('POST', '/v1/feedback', { body: { message: 'Segundo feedback.' } });
  });

  it('demands a token', async () => {
    const response = await api.request('GET', '/v1/admin/feedback');

    expect(response.statusCode).toBe(401);
    expect(response.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('demands a subject in the token', async () => {
    const response = await api.request('GET', '/v1/admin/feedback', { claims: { email: 'x@y.z' } });

    expect(response.statusCode).toBe(403);
    expect(response.body.error?.code).toBe('FORBIDDEN');
  });

  it('answers the administrator with the feedback', async () => {
    const response = await api.request('GET', '/v1/admin/feedback', { claims: admin });

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ author: 'Pedro', message: 'Primeiro feedback.' }),
        expect.objectContaining({ author: ANONYMOUS_AUTHOR, message: 'Segundo feedback.' }),
      ]),
    );
  });

  it('carries the date and hour of each feedback', async () => {
    const response = await api.request('GET', '/v1/admin/feedback', { claims: admin });
    const [first] = response.body.data as { submittedAt: string }[];

    expect(first?.submittedAt).toBe('2026-08-22T12:00:00.000Z');
  });

  it('pages with an opaque cursor', async () => {
    const first = await api.request('GET', '/v1/admin/feedback', {
      claims: admin,
      query: { limit: '1' },
    });

    expect(first.body.data).toHaveLength(1);
    const cursor = first.body.meta?.nextCursor;
    expect(typeof cursor).toBe('string');

    const second = await api.request('GET', '/v1/admin/feedback', {
      claims: admin,
      query: { limit: '1', cursor: String(cursor) },
    });

    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta?.nextCursor).toBeNull();
  });

  it('rejects a limit outside the allowed range', async () => {
    const response = await api.request('GET', '/v1/admin/feedback', {
      claims: admin,
      query: { limit: '500' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
