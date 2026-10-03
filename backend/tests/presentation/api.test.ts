import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApi, type TestApi } from '../support/test-api.js';

const validBody = {
  name: 'Ecoponto Centro',
  address: 'Rua Pará, 500',
  materials: ['Pilhas', 'Baterias'],
  openingHours: 'Seg a Sex, 8h às 18h',
  notes: 'Entrada pela lateral',
};

describe('public API', () => {
  let api: TestApi;

  beforeEach(() => {
    api = buildTestApi();
  });

  it('answers the health check', async () => {
    const response = await api.request('GET', '/v1/health');
    expect(response.statusCode).toBe(200);
    expect(response.body.data).toEqual({ status: 'ok' });
  });

  it('lists the suggested materials', async () => {
    const response = await api.request('GET', '/v1/materials');

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toContainEqual({ label: 'Pilhas' });
  });

  describe('POST /v1/collection-points', () => {
    it('creates a point and returns it', async () => {
      const response = await api.request('POST', '/v1/collection-points', { body: validBody });

      expect(response.statusCode).toBe(201);
      expect(response.body.data).toMatchObject({
        name: 'Ecoponto Centro',
        status: 'PUBLISHED',
        location: { latitude: -23.3103, longitude: -51.1628 },
      });
    });

    it('rejects a body without materials with 400', async () => {
      const response = await api.request('POST', '/v1/collection-points', {
        body: { ...validBody, materials: [] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing body with 400', async () => {
      const response = await api.request('POST', '/v1/collection-points');
      expect(response.statusCode).toBe(400);
    });

    it('rejects a duplicated point with 409', async () => {
      await api.request('POST', '/v1/collection-points', { body: validBody });
      const response = await api.request('POST', '/v1/collection-points', { body: validBody });

      expect(response.statusCode).toBe(409);
      expect(response.body.error?.code).toBe('CONFLICT');
    });

    it('answers 404 when the address cannot be located', async () => {
      api.geocoding.respondWith([]);
      const response = await api.request('POST', '/v1/collection-points', { body: validBody });

      expect(response.statusCode).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /v1/collection-points', () => {
    beforeEach(async () => {
      await api.request('POST', '/v1/collection-points', { body: validBody });
      await api.request('POST', '/v1/collection-points', {
        body: { ...validBody, name: 'Mercado Central', materials: ['Óleo de cozinha'] },
      });
    });

    it('returns every published point', async () => {
      const response = await api.request('GET', '/v1/collection-points');

      expect(response.statusCode).toBe(200);
      expect(response.body.meta?.count).toBe(2);
    });

    it('filters by material, normalising the query', async () => {
      const response = await api.request('GET', '/v1/collection-points', {
        query: { material: 'ÓLEO DE COZINHA' },
      });

      expect(response.body.meta?.material).toMatchObject({ slug: 'oleo-de-cozinha' });
      expect(response.body.data).toHaveLength(1);
    });

    it('returns an empty list for a material nobody accepts', async () => {
      const response = await api.request('GET', '/v1/collection-points', {
        query: { material: 'Entulho' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('rejects an invalid limit with 400', async () => {
      const response = await api.request('GET', '/v1/collection-points', {
        query: { limit: '9999' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/collection-points/nearby', () => {
    beforeEach(async () => {
      await api.request('POST', '/v1/collection-points', { body: validBody });
    });

    it('searches by address and returns the distance', async () => {
      const response = await api.request('GET', '/v1/collection-points/nearby', {
        query: { address: 'Rua Pará, 500' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.meta?.radiusKm).toBe(5);
      expect(response.body.data).toMatchObject([{ distanceKm: 0 }]);
    });

    it('searches by explicit coordinates', async () => {
      const response = await api.request('GET', '/v1/collection-points/nearby', {
        query: { lat: '-23.3103', lng: '-51.1628', radiusKm: '2' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    it('requires an address or coordinates', async () => {
      const response = await api.request('GET', '/v1/collection-points/nearby');
      expect(response.statusCode).toBe(400);
    });

    it('answers 404 when the address does not exist', async () => {
      api.geocoding.respondWith([]);
      const response = await api.request('GET', '/v1/collection-points/nearby', {
        query: { address: 'Rua que não existe' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.body.error?.code).toBe('ADDRESS_NOT_FOUND');
    });
  });

  describe('GET /v1/collection-points/{id}', () => {
    it('returns the details of a point', async () => {
      const created = await api.request('POST', '/v1/collection-points', { body: validBody });
      const id = (created.body.data as { id: string }).id;

      const response = await api.request('GET', `/v1/collection-points/${id}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data).toMatchObject({
        id,
        openingHours: 'Seg a Sex, 8h às 18h',
        notes: 'Entrada pela lateral',
      });
    });

    it('answers 404 for an unknown point', async () => {
      const response = await api.request('GET', '/v1/collection-points/does-not-exist');

      expect(response.statusCode).toBe(404);
      expect(response.body.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /v1/metrics/events', () => {
    it('accepts an event the app is allowed to report', async () => {
      const response = await api.request('POST', '/v1/metrics/events', {
        body: { type: 'app_open' },
      });

      expect(response.statusCode).toBe(202);
      expect(api.metricsRepository.counters.get('2026-08-22')?.app_open).toBe(1);
    });

    it('rejects an event the backend counts by itself', async () => {
      const response = await api.request('POST', '/v1/metrics/events', {
        body: { type: 'point_created' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  it('answers 404 for an unknown route and 405 for a wrong method', async () => {
    expect((await api.request('GET', '/v1/unknown')).statusCode).toBe(404);
    expect((await api.request('POST', '/v1/health')).statusCode).toBe(405);
  });
});

describe('admin API', () => {
  let api: TestApi;

  beforeEach(() => {
    api = buildTestApi();
  });

  it('rejects a request without a token', async () => {
    const response = await api.request('GET', '/v1/admin/metrics');

    expect(response.statusCode).toBe(401);
    expect(response.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('rejects a token without a subject', async () => {
    const response = await api.request('GET', '/v1/admin/metrics', { claims: {} });

    expect(response.statusCode).toBe(403);
    expect(response.body.error?.code).toBe('FORBIDDEN');
  });

  it('returns the report for an authenticated administrator', async () => {
    await api.request('POST', '/v1/metrics/events', { body: { type: 'app_open' } });

    const response = await api.request('GET', '/v1/admin/metrics', {
      claims: { sub: 'admin-1' },
      query: { days: '7' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toMatchObject({
      period: { days: 7 },
      totals: { app_open: 1 },
    });
  });

  it('rejects a malformed period', async () => {
    const response = await api.request('GET', '/v1/admin/metrics', {
      claims: { sub: 'admin-1' },
      query: { from: '22-08-2026', to: '2026-08-23' },
    });

    expect(response.statusCode).toBe(400);
  });
});
