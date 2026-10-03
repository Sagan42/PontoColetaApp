import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError } from '../../src/shared/domain/errors/index.js';
import { NominatimGeocodingService } from '../../src/modules/collection-points/infrastructure/geocoding/nominatim-geocoding-service.js';
import { silentLogger } from '../support/fakes.js';

const options = {
  baseUrl: 'https://nominatim.example.org',
  userAgent: 'PontoColeta/test',
  timeoutMs: 1000,
};

function buildService(): NominatimGeocodingService {
  return new NominatimGeocodingService(options, silentLogger);
}

function mockFetch(response: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(response),
    } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NominatimGeocodingService', () => {
  it('restricts the search to the service area', async () => {
    const fetchMock = mockFetch([]);
    await buildService().search('Rua Pará, 500');

    const requestedUrl = fetchMock.mock.calls[0]?.[0];
    const url = new URL(typeof requestedUrl === 'string' ? requestedUrl : '');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('Rua Pará, 500');
    expect(url.searchParams.get('countrycodes')).toBe('br');
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('viewbox')).toBe('-51.42,-23.05,-50.85,-23.62');
  });

  it('identifies itself, as the provider usage policy requires', async () => {
    const fetchMock = mockFetch([]);
    await buildService().search('Centro');

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['User-Agent']).toBe('PontoColeta/test');
  });

  it('maps results into coordinates', async () => {
    mockFetch([
      { lat: '-23.3103', lon: '-51.1628', display_name: 'Centro, Londrina', importance: 0.7 },
      { lat: 'invalid', lon: '-51.1', display_name: 'Descartado' },
    ]);

    const results = await buildService().search('Centro');

    expect(results).toHaveLength(1);
    expect(results[0]?.coordinates.latitude).toBe(-23.3103);
    expect(results[0]?.formattedAddress).toBe('Centro, Londrina');
    expect(results[0]?.confidence).toBe(0.7);
  });

  it('answers a repeated lookup from cache instead of calling the provider again', async () => {
    const fetchMock = mockFetch([{ lat: '-23.31', lon: '-51.16', display_name: 'Centro' }]);
    const service = buildService();

    await service.search('Centro');
    await service.search('Centro');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call the provider for an empty address', async () => {
    const fetchMock = mockFetch([]);
    await expect(buildService().search('   ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a provider failure into a domain error without leaking details', async () => {
    mockFetch([], false, 503);

    await expect(buildService().search('Centro')).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('turns a network error into a domain error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNRESET'))),
    );

    await expect(buildService().search('Centro')).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
