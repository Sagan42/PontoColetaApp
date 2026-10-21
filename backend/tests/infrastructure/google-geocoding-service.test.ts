import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleGeocodingService } from '../../src/modules/collection-points/infrastructure/geocoding/google-geocoding-service.js';
import { ExternalServiceError } from '../../src/shared/domain/errors/index.js';
import { createRecordingLogger, silentLogger } from '../support/fakes.js';

const OPTIONS = { apiKey: 'chave-de-teste', timeoutMs: 4000 };

function place(overrides: Record<string, unknown> = {}) {
  return {
    formatted_address: 'Rua Pará, 500 - Centro, Londrina - PR, Brasil',
    geometry: { location: { lat: -23.3103, lng: -51.1628 }, location_type: 'ROOFTOP' },
    ...overrides,
  };
}

function respondWith(body: unknown, init: { status?: number } = {}) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

/** Relógio controlado: nenhum teste espera segundos de verdade. */
function timers() {
  let current = 0;
  return {
    now: () => current,
    wait: (ms: number) => {
      current += ms;
      return Promise.resolve();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GoogleGeocodingService', () => {
  it('converte o primeiro resultado em coordenadas', async () => {
    vi.stubGlobal('fetch', respondWith({ status: 'OK', results: [place()] }));

    const service = new GoogleGeocodingService(OPTIONS, silentLogger, timers());
    const results = await service.search('Rua Pará, 500');

    expect(results).toHaveLength(1);
    expect(results[0]?.coordinates.latitude).toBe(-23.3103);
    expect(results[0]?.coordinates.longitude).toBe(-51.1628);
    expect(results[0]?.formattedAddress).toContain('Londrina');
  });

  it('restringe a busca ao Paraná e inclina para Londrina', async () => {
    const fetchMock = respondWith({ status: 'OK', results: [place()] });
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search('Rua Pará');

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/maps/api/geocode/json');
    expect(url.searchParams.get('components')).toBe('country:BR|administrative_area:PR');
    expect(url.searchParams.get('bounds')).toBe('-23.62,-51.42|-23.05,-50.85');
    expect(url.searchParams.get('key')).toBe('chave-de-teste');
    expect(url.searchParams.get('language')).toBe('pt-BR');
  });

  it('traduz ZERO_RESULTS como endereço inexistente, não como falha', async () => {
    vi.stubGlobal('fetch', respondWith({ status: 'ZERO_RESULTS', results: [] }));

    const results = await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search(
      'Rua Que Não Existe',
    );

    expect(results).toEqual([]);
  });

  it.each(['REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'INVALID_REQUEST', 'MISSING_STATUS'])(
    'trata %s como recusa do provedor, nunca como endereço inexistente',
    async (status) => {
      vi.stubGlobal('fetch', respondWith(status === 'MISSING_STATUS' ? {} : { status }));

      const service = new GoogleGeocodingService(OPTIONS, silentLogger, timers());

      await expect(service.search('Rua Pará, 500')).rejects.toThrow(ExternalServiceError);
    },
  );

  it('registra a recusa com o estado devolvido pelo provedor', async () => {
    vi.stubGlobal('fetch', respondWith({ status: 'REQUEST_DENIED' }));
    const { logger, warnings } = createRecordingLogger();

    await expect(
      new GoogleGeocodingService(OPTIONS, logger, timers()).search('Rua Pará, 500'),
    ).rejects.toThrow(ExternalServiceError);

    expect(warnings.at(-1)?.message).toBe('geocoding.request.rejected');
    expect(warnings.at(-1)?.context).toMatchObject({ providerStatus: 'REQUEST_DENIED' });
  });

  it('nunca vaza a chave na mensagem de erro', async () => {
    vi.stubGlobal('fetch', respondWith({ status: 'REQUEST_DENIED', error_message: 'bad key' }));

    await expect(
      new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search('Rua Pará, 500'),
    ).rejects.toThrow(/não foi possível consultar/i);
  });

  it('repete uma vez quando o provedor diz UNKNOWN_ERROR', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'UNKNOWN_ERROR' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'OK', results: [place()] })));
    vi.stubGlobal('fetch', fetchMock);

    const results = await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search(
      'Rua Pará, 500',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
  });

  it('não repete quando a recusa é definitiva', async () => {
    const fetchMock = respondWith({ status: 'REQUEST_DENIED' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search('Rua Pará, 500'),
    ).rejects.toThrow(ExternalServiceError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repete uma vez quando a rede falha', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'OK', results: [place()] })));
    vi.stubGlobal('fetch', fetchMock);

    const results = await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search(
      'Rua Pará, 500',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
  });

  it('trata 5xx como recusa repetível e 4xx como definitiva', async () => {
    const serverError = respondWith({}, { status: 503 });
    vi.stubGlobal('fetch', serverError);
    await expect(
      new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search('Rua Pará, 500'),
    ).rejects.toThrow(ExternalServiceError);
    expect(serverError).toHaveBeenCalledTimes(2);

    const clientError = respondWith({}, { status: 400 });
    vi.stubGlobal('fetch', clientError);
    await expect(
      new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search('Rua Pará, 500'),
    ).rejects.toThrow(ExternalServiceError);
    expect(clientError).toHaveBeenCalledTimes(1);
  });

  it('descarta resultado sem coordenada utilizável', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({
        status: 'OK',
        results: [place({ geometry: { location: { lat: 'x', lng: null } } }), place()],
      }),
    );

    const results = await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search(
      'Rua Pará, 500',
    );

    expect(results).toHaveLength(1);
  });

  it('traduz o tipo de localização em confiança e penaliza casamento parcial', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({
        status: 'OK',
        results: [
          place({ geometry: { location: { lat: -23.31, lng: -51.16 }, location_type: 'ROOFTOP' } }),
          place({
            geometry: { location: { lat: -23.32, lng: -51.17 }, location_type: 'APPROXIMATE' },
            partial_match: true,
          }),
          place({ geometry: { location: { lat: -23.33, lng: -51.18 } } }),
        ],
      }),
    );

    const results = await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search(
      'Rua Pará, 500',
    );

    expect(results[0]?.confidence).toBe(1);
    expect(results[1]?.confidence).toBe(0.2);
    expect(results[2]?.confidence).toBeNull();
  });

  it('devolve no máximo cinco resultados', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({ status: 'OK', results: Array.from({ length: 9 }, () => place()) }),
    );

    const results = await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search(
      'Rua Pará',
    );

    expect(results).toHaveLength(5);
  });

  it('usa o cache na segunda busca igual, sem chamar o provedor', async () => {
    const fetchMock = respondWith({ status: 'OK', results: [place()] });
    vi.stubGlobal('fetch', fetchMock);

    const service = new GoogleGeocodingService(OPTIONS, silentLogger, timers());
    await service.search('Rua Pará, 500');
    await service.search('Rua Pará, 500');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não chama o provedor com busca vazia', async () => {
    const fetchMock = respondWith({ status: 'OK', results: [] });
    vi.stubGlobal('fetch', fetchMock);

    const results = await new GoogleGeocodingService(OPTIONS, silentLogger, timers()).search('   ');

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
