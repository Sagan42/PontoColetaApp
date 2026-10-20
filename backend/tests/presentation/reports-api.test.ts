import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApi, type TestApi } from '../support/test-api.js';

const admin = { sub: 'admin-1', email: 'admin@pontocoleta.app' };

async function createPoint(api: TestApi): Promise<string> {
  const response = await api.request('POST', '/v1/collection-points', {
    body: {
      name: 'Ecoponto Centro',
      address: 'Rua Pará, 500',
      materials: ['Pilhas'],
    },
  });

  return (response.body.data as { id: string }).id;
}

describe('POST /v1/collection-points/{id}/reports', () => {
  let api: TestApi;
  let pointId: string;

  beforeEach(async () => {
    api = buildTestApi();
    pointId = await createPoint(api);
  });

  it('accepts a report without asking who is reporting', async () => {
    const response = await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'inappropriate' },
    });

    expect(response.statusCode).toBe(202);
    expect(api.reportRepository.saved).toHaveLength(1);
    expect(api.reportRepository.saved[0]?.reason).toBe('inappropriate');
    expect(api.reportRepository.saved[0]?.pointId).toBe(pointId);
  });

  it('keeps the optional details', async () => {
    await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'closed', details: 'O local fechou no mês passado.' },
    });

    expect(api.reportRepository.saved[0]?.details).toBe('O local fechou no mês passado.');
  });

  it('records the instant of the report', async () => {
    await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'incorrect' },
    });

    expect(api.reportRepository.saved[0]?.reportedAt).toEqual(
      new Date('2026-08-22T12:00:00.000Z'),
    );
  });

  it('copies the name of the reported point', async () => {
    await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'incorrect' },
    });

    expect(api.reportRepository.saved[0]?.pointName).toBe('Ecoponto Centro');
  });

  it('sanitises the details like any other free text', async () => {
    await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'other', details: 'Vejam\u0000​‮isto\u0007 aqui' },
    });

    expect(api.reportRepository.saved[0]?.details).toBe('Vejamisto aqui');
  });

  it('refuses a reason outside the list', async () => {
    const response = await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'qualquer-coisa' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    expect(api.reportRepository.saved).toHaveLength(0);
  });

  it('refuses a report without a reason', async () => {
    const response = await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { details: 'Sem motivo.' },
    });

    expect(response.statusCode).toBe(400);
    expect(api.reportRepository.saved).toHaveLength(0);
  });

  it('refuses details over the limit', async () => {
    const response = await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'other', details: 'a'.repeat(501) },
    });

    expect(response.statusCode).toBe(400);
    expect(api.reportRepository.saved).toHaveLength(0);
  });

  it('answers 404 for a point that does not exist', async () => {
    const response = await api.request('POST', '/v1/collection-points/nao-existe/reports', {
      body: { reason: 'inappropriate' },
    });

    expect(response.statusCode).toBe(404);
    expect(api.reportRepository.saved).toHaveLength(0);
  });

  it('still accepts a report for a point already taken off the air', async () => {
    await api.request('POST', `/v1/admin/collection-points/${pointId}/hide`, { claims: admin });

    const response = await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'inappropriate' },
    });

    expect(response.statusCode).toBe(202);
    expect(api.reportRepository.saved).toHaveLength(1);
  });

  it('answers nothing about the report itself', async () => {
    const response = await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'inappropriate', details: 'texto da denúncia' },
    });

    expect(JSON.stringify(response.body)).not.toContain('denúncia');
  });
});

describe('GET /v1/admin/reports', () => {
  let api: TestApi;

  beforeEach(async () => {
    api = buildTestApi();
    const pointId = await createPoint(api);

    await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'inappropriate', details: 'Conteúdo ofensivo no nome.' },
    });
    await api.request('POST', `/v1/collection-points/${pointId}/reports`, {
      body: { reason: 'closed' },
    });
  });

  it('demands a token', async () => {
    const response = await api.request('GET', '/v1/admin/reports');

    expect(response.statusCode).toBe(401);
    expect(response.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('demands a subject in the token', async () => {
    const response = await api.request('GET', '/v1/admin/reports', { claims: { email: 'x@y.z' } });

    expect(response.statusCode).toBe(403);
    expect(response.body.error?.code).toBe('FORBIDDEN');
  });

  it('answers the administrator with the reports', async () => {
    const response = await api.request('GET', '/v1/admin/reports', { claims: admin });

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'inappropriate',
          details: 'Conteúdo ofensivo no nome.',
          pointName: 'Ecoponto Centro',
        }),
        expect.objectContaining({ reason: 'closed', details: null }),
      ]),
    );
  });

  it('pages with an opaque cursor', async () => {
    const first = await api.request('GET', '/v1/admin/reports', {
      claims: admin,
      query: { limit: '1' },
    });

    expect(first.body.data).toHaveLength(1);
    expect(typeof first.body.meta?.nextCursor).toBe('string');

    const second = await api.request('GET', '/v1/admin/reports', {
      claims: admin,
      query: { limit: '1', cursor: String(first.body.meta?.nextCursor) },
    });

    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta?.nextCursor).toBeNull();
  });

  it('rejects a limit outside the allowed range', async () => {
    const response = await api.request('GET', '/v1/admin/reports', {
      claims: admin,
      query: { limit: '500' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('lets the administrator act on what was reported', async () => {
    const reported = api.reportRepository.saved[0];

    const response = await api.request(
      'POST',
      `/v1/admin/collection-points/${reported?.pointId}/hide`,
      { claims: admin },
    );

    expect(response.statusCode).toBe(200);
    expect((response.body.data as { status: string }).status).toBe('HIDDEN');
  });
});
