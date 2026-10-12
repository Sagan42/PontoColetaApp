import { z } from 'zod';
import { usageMetricsReportSchema } from '../src/features/admin/hooks';
import { collectionPointsApi, type CollectionPoint } from '../src/features/collection-points/api';
import { ApiError, apiEnvelope, apiRequest } from '../src/services/apiClient';

const fetchMock = jest.fn();
const globalFetch = globalThis as { fetch: typeof fetch };
const originalFetch = globalFetch.fetch;

const INVALID_RESPONSE_MESSAGE = 'Resposta inesperada do servidor. Tente novamente.';

function jsonBody(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** What a captive portal or an HTML error page looks like from here. */
function unparseableBody(status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
  } as unknown as Response;
}

const point: CollectionPoint = {
  id: 'point-1',
  name: 'Ecoponto Centro',
  address: {
    line: 'Rua Pará, 500',
    city: 'Londrina',
    state: 'PR',
    formatted: 'Rua Pará, 500, Londrina, PR',
  },
  location: { latitude: -23.3103, longitude: -51.1628 },
  materials: [{ label: 'Pilhas', slug: 'pilhas' }],
  openingHours: 'Seg a Sex, 8h às 18h',
  notes: null,
  status: 'PUBLISHED',
  distanceKm: 1.2,
  createdAt: '2026-08-22T12:00:00.000Z',
  updatedAt: '2026-08-22T12:00:00.000Z',
};

const report = {
  period: { from: '2026-09-12', to: '2026-10-12', days: 30 },
  totals: {
    app_open: 120,
    search_address: 31,
    search_material: 26,
    point_created: 9,
    point_viewed: 44,
    searches: 57,
  },
  daily: [
    {
      date: '2026-10-12',
      counters: {
        app_open: 10,
        search_address: 3,
        search_material: 2,
        point_created: 1,
        point_viewed: 4,
      },
    },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  globalFetch.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalFetch.fetch = originalFetch;
});

describe('apiRequest response validation', () => {
  const schema = apiEnvelope(z.object({ id: z.string(), count: z.number() }));

  it('returns the body when it matches the schema', async () => {
    fetchMock.mockResolvedValue(jsonBody({ data: { id: 'a', count: 2 } }));

    await expect(apiRequest('/v1/thing', { schema })).resolves.toEqual({
      data: { id: 'a', count: 2 },
    });
  });

  it('rejects a body with a missing field', async () => {
    fetchMock.mockResolvedValue(jsonBody({ data: { id: 'a' } }));

    const failure = apiRequest('/v1/thing', { schema });

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      message: INVALID_RESPONSE_MESSAGE,
      status: 200,
    });
  });

  it('rejects a body that is not JSON at all', async () => {
    fetchMock.mockResolvedValue(unparseableBody());

    await expect(apiRequest('/v1/thing', { schema })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      message: INVALID_RESPONSE_MESSAGE,
    });
  });

  it('rejects a body of the wrong type where the envelope was expected', async () => {
    fetchMock.mockResolvedValue(jsonBody('<html>Faça login na rede Wi-Fi</html>'));

    await expect(apiRequest('/v1/thing', { schema })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('carries the validation issues for diagnosis', async () => {
    fetchMock.mockResolvedValue(jsonBody({ data: { id: 'a' } }));

    const failure = await apiRequest('/v1/thing', { schema }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['data', 'count'] })]),
    );
  });

  it('keeps extra fields from a newer API out of the way instead of failing', async () => {
    fetchMock.mockResolvedValue(
      jsonBody({ data: { id: 'a', count: 2, addedLater: true }, meta: { page: 1 } }),
    );

    await expect(apiRequest('/v1/thing', { schema })).resolves.toEqual({
      data: { id: 'a', count: 2 },
      meta: { page: 1 },
    });
  });

  it('leaves an unvalidated request alone when no schema is given', async () => {
    fetchMock.mockResolvedValue(jsonBody({ anything: 'goes' }));

    await expect(apiRequest('/v1/thing')).resolves.toEqual({ anything: 'goes' });
  });
});

describe('apiRequest HTTP errors', () => {
  const schema = apiEnvelope(z.object({ id: z.string() }));

  it('still reports the error the server sent, not a validation failure', async () => {
    fetchMock.mockResolvedValue(
      jsonBody({ error: { code: 'ADDRESS_NOT_FOUND', message: 'Endereço não encontrado.' } }, 404),
    );

    await expect(apiRequest('/v1/thing', { schema })).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
      message: 'Endereço não encontrado.',
      status: 404,
    });
  });

  it('still falls back to the generic message when an error body is unreadable', async () => {
    fetchMock.mockResolvedValue(unparseableBody(500));

    await expect(apiRequest('/v1/thing', { schema })).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
      message: 'Não foi possível concluir a operação. Tente novamente.',
      status: 500,
    });
  });

  it('still reports a network failure as before', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiRequest('/v1/thing', { schema })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });
});

describe('collectionPointsApi validation', () => {
  it('accepts a well-formed point', async () => {
    fetchMock.mockResolvedValue(jsonBody({ data: point }));

    await expect(collectionPointsApi.getById('point-1')).resolves.toMatchObject({
      id: 'point-1',
      name: 'Ecoponto Centro',
    });
  });

  it('rejects a point that is missing its location', async () => {
    const { location: _location, ...withoutLocation } = point;
    fetchMock.mockResolvedValue(jsonBody({ data: withoutLocation }));

    await expect(collectionPointsApi.getById('point-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      message: INVALID_RESPONSE_MESSAGE,
    });
  });

  it('rejects a list whose items are not points', async () => {
    fetchMock.mockResolvedValue(jsonBody({ data: [{ id: 'point-1' }] }));

    await expect(collectionPointsApi.searchByMaterial('Pilhas')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('rejects a search answered with an HTML page', async () => {
    fetchMock.mockResolvedValue(unparseableBody());

    await expect(collectionPointsApi.searchByMaterial('Pilhas')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('reads the search origin out of meta', async () => {
    fetchMock.mockResolvedValue(
      jsonBody({
        data: [point],
        meta: {
          origin: { latitude: -23.31, longitude: -51.16, formattedAddress: 'Centro, Londrina' },
        },
      }),
    );

    const result = await collectionPointsApi.searchByAddress('Rua Pará, 500');

    expect(result.origin).toEqual({
      latitude: -23.31,
      longitude: -51.16,
      formattedAddress: 'Centro, Londrina',
    });
  });

  it('keeps the points when only the origin is malformed', async () => {
    fetchMock.mockResolvedValue(
      jsonBody({ data: [point], meta: { origin: { latitude: 'muito ao norte' } } }),
    );

    const result = await collectionPointsApi.searchByAddress('Rua Pará, 500');

    expect(result.points.map((entry) => entry.id)).toEqual(['point-1']);
    expect(result.origin).toBeNull();
  });

  it('rejects a materials list of the wrong shape', async () => {
    fetchMock.mockResolvedValue(jsonBody({ data: ['Pilhas'] }));

    await expect(collectionPointsApi.listSuggestedMaterials()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('admin metrics validation', () => {
  it('accepts a complete report', () => {
    expect(usageMetricsReportSchema.safeParse(report).success).toBe(true);
  });

  it('rejects a report missing a total', () => {
    const { searches: _searches, ...totals } = report.totals;

    expect(usageMetricsReportSchema.safeParse({ ...report, totals }).success).toBe(false);
  });

  it('rejects counters that arrive as strings', () => {
    const broken = { ...report, totals: { ...report.totals, app_open: '120' } };

    expect(usageMetricsReportSchema.safeParse(broken).success).toBe(false);
  });
});
