import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError } from '../../src/shared/domain/errors/index.js';
import {
  NominatimGeocodingService,
  type GeocodingTimers,
} from '../../src/modules/collection-points/infrastructure/geocoding/nominatim-geocoding-service.js';
import { createRecordingLogger, silentLogger } from '../support/fakes.js';

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

const PROVIDER_UNAVAILABLE = 'Não foi possível consultar o serviço de endereços. Tente novamente.';

/** Virtual clock: `wait` advances it, so budget maths is exact and tests are instant. */
function fakeTimers() {
  let current = 1_000_000;
  const waits: number[] = [];

  const timers: GeocodingTimers = {
    now: () => current,
    wait: (ms) => {
      waits.push(ms);
      current += ms;
      return Promise.resolve();
    },
  };

  return { timers, waits };
}

type Reply = { status: number; body?: unknown } | Error;

function mockFetchSequence(replies: Reply[]) {
  let index = 0;

  const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) => {
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;

    if (reply instanceof Error) return Promise.reject(reply);

    return Promise.resolve({
      ok: reply !== undefined && reply.status < 400,
      status: reply?.status ?? 200,
      json: () => Promise.resolve(reply?.body ?? []),
    } as Response);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const place = { lat: '-23.31', lon: '-51.16', display_name: 'Centro, Londrina' };

describe('NominatimGeocodingService rate limiting', () => {
  function buildWith(timers: GeocodingTimers, timeoutMs = 4000) {
    const recorder = createRecordingLogger();
    const service = new NominatimGeocodingService(
      { ...options, timeoutMs },
      recorder.logger,
      timers,
    );
    return { service, recorder };
  }

  it('leaves a second between consecutive provider calls', async () => {
    const fetchMock = mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers, waits } = fakeTimers();
    const { service } = buildWith(timers);

    await service.search('Rua A');
    await service.search('Rua B');
    await service.search('Rua C');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The first call goes straight through; each later one waits out the interval.
    expect(waits).toEqual([1000, 1000]);
  });

  it('serialises calls that arrive together instead of bursting', async () => {
    const fetchMock = mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers, waits } = fakeTimers();
    const { service } = buildWith(timers);

    await Promise.all([service.search('Rua A'), service.search('Rua B'), service.search('Rua C')]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 1000]);
  });

  it('gives up instead of queueing past the configured timeout', async () => {
    mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers, 4000);

    const settled = await Promise.allSettled([
      service.search('Rua A'),
      service.search('Rua B'),
      service.search('Rua C'),
      service.search('Rua D'),
      service.search('Rua E'),
    ]);

    // Four fit inside the 4s budget at one per second; the fifth cannot.
    expect(settled.filter((entry) => entry.status === 'fulfilled')).toHaveLength(4);

    const rejected = settled[4];
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(ExternalServiceError);
      expect((rejected.reason as Error).message).toBe(PROVIDER_UNAVAILABLE);
    }

    expect(recorder.warnings.map((entry) => entry.message)).toContain(
      'geocoding.rate_limit.exhausted',
    );
  });

  it('serves a repeated query from cache without spending a rate limit slot', async () => {
    const fetchMock = mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers, waits } = fakeTimers();
    const { service } = buildWith(timers);

    await service.search('Centro');
    await service.search('Centro');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('coalesces identical queries that arrive together into one provider call', async () => {
    const fetchMock = mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers, waits } = fakeTimers();
    const { service } = buildWith(timers);

    const [first, second] = await Promise.all([service.search('Centro'), service.search('Centro')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
    expect(second).toEqual(first);
  });
});

describe('NominatimGeocodingService retrying', () => {
  function buildWith(timers: GeocodingTimers, timeoutMs = 4000) {
    const recorder = createRecordingLogger();
    const service = new NominatimGeocodingService(
      { ...options, timeoutMs },
      recorder.logger,
      timers,
    );
    return { service, recorder };
  }

  it('retries once after a 5xx and returns the second answer', async () => {
    const fetchMock = mockFetchSequence([{ status: 503 }, { status: 200, body: [place] }]);
    const { timers, waits } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    const results = await service.search('Centro');

    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Short backoff, then the rest of the one-per-second interval.
    expect(waits).toEqual([250, 750]);
    expect(recorder.warnings.map((entry) => entry.message)).toEqual(['geocoding.request.retrying']);
    expect(recorder.warnings[0]?.context).toMatchObject({ status: 503, backoffMs: 250 });
  });

  it('retries once after a network error', async () => {
    const fetchMock = mockFetchSequence([new Error('ECONNRESET'), { status: 200, body: [place] }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    await expect(service.search('Centro')).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recorder.warnings[0]?.context).toMatchObject({ errorType: 'Error' });
  });

  it('does not retry a 4xx, which would only burn the rate budget', async () => {
    const fetchMock = mockFetchSequence([{ status: 400 }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    await expect(service.search('Centro')).rejects.toBeInstanceOf(ExternalServiceError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recorder.warnings.map((entry) => entry.message)).toEqual(['geocoding.request.rejected']);
  });

  it('retries at most once, then reports the failure', async () => {
    const fetchMock = mockFetchSequence([{ status: 503 }, { status: 503 }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    await expect(service.search('Centro')).rejects.toBeInstanceOf(ExternalServiceError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recorder.warnings.map((entry) => entry.message)).toEqual([
      'geocoding.request.retrying',
      'geocoding.request.rejected',
    ]);
    expect(recorder.warnings[1]?.context).toMatchObject({ retried: true });
  });

  it('skips the retry when the timeout leaves no room for a second call', async () => {
    const fetchMock = mockFetchSequence([{ status: 503 }, { status: 200, body: [place] }]);
    const { timers } = fakeTimers();
    // A second call has to wait out the one-per-second interval, which does not
    // fit in a 1s budget.
    const { service } = buildWith(timers, 1000);

    await expect(service.search('Centro')).rejects.toBeInstanceOf(ExternalServiceError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing message for every failure path', async () => {
    mockFetchSequence([{ status: 400 }]);
    const { timers } = fakeTimers();
    const { service } = buildWith(timers);

    await expect(service.search('Centro')).rejects.toThrow(PROVIDER_UNAVAILABLE);
  });
});

describe('NominatimGeocodingService logging', () => {
  function buildWith(timers: GeocodingTimers, timeoutMs = 4000) {
    const recorder = createRecordingLogger();
    const service = new NominatimGeocodingService(
      { ...options, timeoutMs },
      recorder.logger,
      timers,
    );
    return { service, recorder };
  }

  it('reports cache, limiter wait and retry on a straight call', async () => {
    mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    await service.search('Centro');

    expect(recorder.debugs).toHaveLength(1);
    expect(recorder.debugs[0]?.message).toBe('geocoding.request.completed');
    expect(recorder.debugs[0]?.context).toMatchObject({
      cacheHit: false,
      waitedMs: 0,
      retried: false,
      resultCount: 1,
    });
  });

  it('reports a cache hit', async () => {
    mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    await service.search('Centro');
    await service.search('Centro');

    expect(recorder.debugs[1]?.context).toMatchObject({
      cacheHit: true,
      waitedMs: 0,
      retried: false,
    });
  });

  it('reports how long the limiter held the call', async () => {
    mockFetchSequence([{ status: 200, body: [place] }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    await service.search('Rua A');
    await service.search('Rua B');

    expect(recorder.debugs[1]?.context).toMatchObject({
      cacheHit: false,
      waitedMs: 1000,
      retried: false,
    });
  });

  it('reports a retry on the call that needed it', async () => {
    mockFetchSequence([{ status: 503 }, { status: 200, body: [place] }]);
    const { timers } = fakeTimers();
    const { service, recorder } = buildWith(timers);

    await service.search('Centro');

    expect(recorder.debugs[0]?.context).toMatchObject({
      cacheHit: false,
      waitedMs: 750,
      retried: true,
    });
  });
});
