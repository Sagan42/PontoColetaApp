import type { Logger } from '../../../../shared/application/ports/index.js';
import { ExternalServiceError } from '../../../../shared/domain/errors/index.js';
import type {
  GeocodingResult,
  GeocodingService,
} from '../../application/ports/geocoding-service.js';
import { SERVICE_AREA } from '../../domain/service-area.js';
import { Coordinates } from '../../domain/value-objects/coordinates.js';
import { realTimers, type GeocodingTimers } from './timers.js';

export interface GoogleGeocodingOptions {
  readonly apiKey: string;
  readonly timeoutMs: number;
  /** Trocável só para teste; em produção é sempre a API pública do Google. */
  readonly baseUrl?: string;
}

interface GooglePayload {
  status?: string;
  error_message?: string;
  results?: GooglePlace[];
}

interface GooglePlace {
  formatted_address?: string;
  partial_match?: boolean;
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
}

type Attempt =
  | { readonly ok: true; readonly results: GeocodingResult[] }
  | { readonly ok: false; readonly retryable: boolean; readonly status: number }
  | { readonly ok: false; readonly retryable: boolean; readonly providerStatus: string }
  | { readonly ok: false; readonly retryable: boolean; readonly errorType: string };

const DEFAULT_BASE_URL = 'https://maps.googleapis.com';
const MAX_RESULTS = 5;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const RETRY_BACKOFF_MS = 250;
const MIN_ATTEMPT_BUDGET_MS = 250;

const PROVIDER_UNAVAILABLE = 'Não foi possível consultar o serviço de endereços. Tente novamente.';

/**
 * Quanto a geometria do resultado vale como confiança. O Google não dá uma nota
 * como o Nominatim; dá o tipo de localização, que é uma informação melhor.
 */
const CONFIDENCE_BY_LOCATION_TYPE: Record<string, number> = {
  ROOFTOP: 1,
  RANGE_INTERPOLATED: 0.8,
  GEOMETRIC_CENTER: 0.6,
  APPROXIMATE: 0.4,
};

/**
 * Geocodificação pela API do Google.
 *
 * Existe porque o Nominatim público recusa requisições vindas de IP de nuvem —
 * e recusa **em silêncio**, devolvendo HTTP 200 com lista vazia. O app dizia
 * "endereço não encontrado" para quem digitou certo, e nenhum alarme tocava,
 * porque nada tinha falhado do ponto de vista do HTTP.
 *
 * Duas decisões vêm direto desse episódio:
 *
 * 1. O Google **também** responde 200 com um campo `status` no corpo. Aqui esse
 *    campo é traduzido com cuidado: só `ZERO_RESULTS` é "não achei". Qualquer
 *    outro estado é recusa do provedor e vira `ExternalServiceError`, que o
 *    cliente vê como 503 e o log registra como `warn`. Recusa nunca se disfarça
 *    de endereço inexistente.
 * 2. Não há fila de 1 req/s. A cota do Google é por minuto e por dia, não por
 *    segundo, então serializar chamadas só adicionaria latência.
 *
 * O cache de uma hora continua, agora com um motivo a mais: cada chamada é
 * cobrada.
 */
export class GoogleGeocodingService implements GeocodingService {
  private readonly cache = new Map<string, { expiresAt: number; results: GeocodingResult[] }>();

  constructor(
    private readonly options: GoogleGeocodingOptions,
    private readonly logger: Logger,
    private readonly timers: GeocodingTimers = realTimers,
  ) {}

  async search(address: string): Promise<GeocodingResult[]> {
    const query = address.trim();
    if (query.length === 0) return [];

    const started = this.timers.now();

    const cached = this.readFromCache(query);
    if (cached) {
      this.logCompleted(cached.length, { started, cacheHit: true, retried: false });
      return cached;
    }

    return this.request(query, started);
  }

  private async request(query: string, started: number): Promise<GeocodingResult[]> {
    const deadline = started + this.options.timeoutMs;
    let retried = false;

    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.attempt(query, deadline);

      if (outcome.ok) {
        this.writeToCache(query, outcome.results);
        this.logCompleted(outcome.results.length, { started, cacheHit: false, retried });
        return outcome.results;
      }

      const budgetLeft = deadline - this.timers.now();
      const canRetry =
        attempt === 1 &&
        outcome.retryable &&
        budgetLeft >= RETRY_BACKOFF_MS + MIN_ATTEMPT_BUDGET_MS;

      if (!canRetry) {
        this.logFailure(outcome, { started, retried });
        throw new ExternalServiceError(PROVIDER_UNAVAILABLE, 'google-geocoding');
      }

      this.logger.warn('geocoding.request.retrying', {
        operation: 'GoogleGeocodingService.search',
        ...this.describe(outcome),
        backoffMs: RETRY_BACKOFF_MS,
      });

      retried = true;
      await this.timers.wait(RETRY_BACKOFF_MS);
    }
  }

  private async attempt(query: string, deadline: number): Promise<Attempt> {
    const remainingMs = deadline - this.timers.now();

    let response: Response;
    try {
      response = await fetch(this.buildUrl(query), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.max(remainingMs, 1)),
      });
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      };
    }

    if (!response.ok) {
      return { ok: false, retryable: response.status >= 500, status: response.status };
    }

    const payload = (await response.json()) as GooglePayload;
    const status = payload.status ?? 'MISSING_STATUS';

    if (status === 'OK') return { ok: true, results: this.toResults(payload.results ?? []) };

    // O único estado que significa de verdade "esse endereço não existe".
    if (status === 'ZERO_RESULTS') return { ok: true, results: [] };

    // Chave inválida, cota estourada, requisição malformada: é recusa, não
    // ausência. `UNKNOWN_ERROR` é o único que a documentação manda repetir.
    return { ok: false, retryable: status === 'UNKNOWN_ERROR', providerStatus: status };
  }

  /**
   * `components` prende o resultado ao Paraná, no Brasil, e `bounds` inclina a
   * busca para o retângulo de Londrina.
   *
   * De propósito não filtra por `locality`: filtro de localidade é rígido e
   * devolveria zero para endereços legítimos escritos de forma diferente, que é
   * justamente o erro que estamos corrigindo. Quem garante a área de
   * atendimento continua sendo o domínio, em `isWithinServiceArea`, onde essa
   * regra sempre morou.
   */
  private buildUrl(query: string): string {
    const { bounds } = SERVICE_AREA;
    const url = new URL('/maps/api/geocode/json', this.options.baseUrl ?? DEFAULT_BASE_URL);

    url.searchParams.set('address', query);
    url.searchParams.set('key', this.options.apiKey);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('region', 'br');
    url.searchParams.set('components', 'country:BR|administrative_area:PR');
    url.searchParams.set(
      'bounds',
      `${bounds.minLatitude},${bounds.minLongitude}|${bounds.maxLatitude},${bounds.maxLongitude}`,
    );

    return url.toString();
  }

  private toResults(places: GooglePlace[]): GeocodingResult[] {
    const results: GeocodingResult[] = [];

    for (const place of places.slice(0, MAX_RESULTS)) {
      const latitude = place.geometry?.location?.lat;
      const longitude = place.geometry?.location?.lng;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      const base = CONFIDENCE_BY_LOCATION_TYPE[place.geometry?.location_type ?? ''] ?? null;

      results.push({
        formattedAddress: place.formatted_address ?? '',
        coordinates: Coordinates.create(latitude as number, longitude as number),
        // Um casamento parcial é um palpite do provedor, não um acerto.
        confidence: base === null ? null : place.partial_match === true ? base / 2 : base,
      });
    }

    return results;
  }

  private describe(outcome: Extract<Attempt, { ok: false }>): Record<string, unknown> {
    if ('status' in outcome) return { status: outcome.status };
    if ('providerStatus' in outcome) return { providerStatus: outcome.providerStatus };
    return { errorType: outcome.errorType };
  }

  private logCompleted(
    resultCount: number,
    call: { started: number; cacheHit: boolean; retried: boolean },
  ): void {
    this.logger.debug('geocoding.request.completed', {
      operation: 'GoogleGeocodingService.search',
      durationMs: this.timers.now() - call.started,
      cacheHit: call.cacheHit,
      retried: call.retried,
      resultCount,
    });
  }

  private logFailure(
    outcome: Extract<Attempt, { ok: false }>,
    call: { started: number; retried: boolean },
  ): void {
    this.logger.warn('geocoding.request.rejected', {
      operation: 'GoogleGeocodingService.search',
      ...this.describe(outcome),
      durationMs: this.timers.now() - call.started,
      retried: call.retried,
    });
  }

  private readFromCache(query: string): GeocodingResult[] | null {
    const entry = this.cache.get(query);
    if (!entry) return null;
    if (entry.expiresAt < this.timers.now()) {
      this.cache.delete(query);
      return null;
    }
    return entry.results;
  }

  private writeToCache(query: string, results: GeocodingResult[]): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(query, { expiresAt: this.timers.now() + CACHE_TTL_MS, results });
  }
}
