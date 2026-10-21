import type { Logger } from '../../../../shared/application/ports/index.js';
import { ExternalServiceError } from '../../../../shared/domain/errors/index.js';
import type {
  GeocodingResult,
  GeocodingService,
} from '../../application/ports/geocoding-service.js';
import { SERVICE_AREA } from '../../domain/service-area.js';
import { Coordinates } from '../../domain/value-objects/coordinates.js';
import { realTimers, type GeocodingTimers } from './timers.js';

export { realTimers, type GeocodingTimers };

export interface NominatimOptions {
  readonly baseUrl: string;
  readonly userAgent: string;
  readonly timeoutMs: number;
}

interface NominatimPlace {
  lat?: string;
  lon?: string;
  display_name?: string;
  importance?: number;
}

type Attempt =
  | { readonly ok: true; readonly results: GeocodingResult[] }
  | { readonly ok: false; readonly retryable: boolean; readonly status: number }
  | { readonly ok: false; readonly retryable: boolean; readonly errorType: string };

const MAX_RESULTS = 5;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/** The public Nominatim usage policy allows at most one request per second. */
const MIN_REQUEST_INTERVAL_MS = 1000;
const RETRY_BACKOFF_MS = 250;
/** Below this, a further attempt cannot finish before the deadline anyway. */
const MIN_ATTEMPT_BUDGET_MS = 250;

const PROVIDER_UNAVAILABLE = 'Não foi possível consultar o serviço de endereços. Tente novamente.';

export class NominatimGeocodingService implements GeocodingService {
  private readonly cache = new Map<string, { expiresAt: number; results: GeocodingResult[] }>();

  /** Tail of the in-container queue: every provider call waits its turn here. */
  private queue: Promise<unknown> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(
    private readonly options: NominatimOptions,
    private readonly logger: Logger,
    private readonly timers: GeocodingTimers = realTimers,
  ) {}

  async search(address: string): Promise<GeocodingResult[]> {
    const query = address.trim();
    if (query.length === 0) return [];

    const started = this.timers.now();

    const cached = this.readFromCache(query);
    if (cached) {
      this.logCompleted(cached.length, { started, cacheHit: true, waitedMs: 0, retried: false });
      return cached;
    }

    return this.enqueue(() => this.request(query, started));
  }

  /**
   * Serialises provider calls within this container. The limiter only spaces out
   * what one container does: concurrent Lambda containers each hold their own
   * queue, so the policy still relies on the cache and on reserved concurrency.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async request(query: string, started: number): Promise<GeocodingResult[]> {
    // Another call may have filled the cache while this one waited its turn.
    const cached = this.readFromCache(query);
    if (cached) {
      this.logCompleted(cached.length, { started, cacheHit: true, waitedMs: 0, retried: false });
      return cached;
    }

    const deadline = started + this.options.timeoutMs;
    let waitedMs = 0;
    let retried = false;

    for (let attempt = 1; ; attempt += 1) {
      waitedMs += await this.awaitTurn(deadline, { started, waitedMs, retried });

      const outcome = await this.attempt(query, deadline);

      if (outcome.ok) {
        this.writeToCache(query, outcome.results);
        this.logCompleted(outcome.results.length, {
          started,
          cacheHit: false,
          waitedMs,
          retried,
        });
        return outcome.results;
      }

      const budgetLeft = deadline - this.timers.now();
      const canRetry =
        attempt === 1 &&
        outcome.retryable &&
        budgetLeft >= RETRY_BACKOFF_MS + MIN_ATTEMPT_BUDGET_MS + MIN_REQUEST_INTERVAL_MS;

      if (!canRetry) {
        this.logFailure(outcome, { started, waitedMs, retried });
        throw new ExternalServiceError(PROVIDER_UNAVAILABLE, 'nominatim');
      }

      this.logger.warn('geocoding.request.retrying', {
        operation: 'NominatimGeocodingService.search',
        ...this.describe(outcome),
        backoffMs: RETRY_BACKOFF_MS,
      });

      retried = true;
      await this.timers.wait(RETRY_BACKOFF_MS);
    }
  }

  /**
   * Holds the caller until the next request is allowed, and gives up instead of
   * queueing past the configured timeout.
   */
  private async awaitTurn(deadline: number, call: CallState): Promise<number> {
    const now = this.timers.now();
    const waitMs = Math.max(0, this.nextRequestAt - now);

    if (now + waitMs + MIN_ATTEMPT_BUDGET_MS > deadline) {
      this.logger.warn('geocoding.rate_limit.exhausted', {
        operation: 'NominatimGeocodingService.search',
        waitMs,
        timeoutMs: this.options.timeoutMs,
        durationMs: now - call.started,
        cacheHit: false,
        waitedMs: call.waitedMs,
        retried: call.retried,
      });
      throw new ExternalServiceError(PROVIDER_UNAVAILABLE, 'nominatim');
    }

    // Reserve the slot before waiting, so a queued caller cannot take it.
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + MIN_REQUEST_INTERVAL_MS;
    if (waitMs > 0) await this.timers.wait(waitMs);

    return waitMs;
  }

  private async attempt(query: string, deadline: number): Promise<Attempt> {
    const remainingMs = deadline - this.timers.now();

    let response: Response;
    try {
      response = await fetch(this.buildUrl(query), {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
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
      // 4xx is the provider telling us the request itself is wrong; repeating it
      // only burns the rate budget. 5xx is worth one more try.
      return { ok: false, retryable: response.status >= 500, status: response.status };
    }

    const payload = (await response.json()) as NominatimPlace[];
    return { ok: true, results: this.toResults(payload) };
  }

  private describe(outcome: Extract<Attempt, { ok: false }>): Record<string, unknown> {
    return 'status' in outcome ? { status: outcome.status } : { errorType: outcome.errorType };
  }

  private logCompleted(resultCount: number, call: CallState & { cacheHit: boolean }): void {
    this.logger.debug('geocoding.request.completed', {
      operation: 'NominatimGeocodingService.search',
      durationMs: this.timers.now() - call.started,
      cacheHit: call.cacheHit,
      waitedMs: call.waitedMs,
      retried: call.retried,
      resultCount,
    });
  }

  private logFailure(outcome: Extract<Attempt, { ok: false }>, call: CallState): void {
    const event = 'status' in outcome ? 'geocoding.request.rejected' : 'geocoding.request.failed';

    this.logger.warn(event, {
      operation: 'NominatimGeocodingService.search',
      ...this.describe(outcome),
      durationMs: this.timers.now() - call.started,
      cacheHit: false,
      waitedMs: call.waitedMs,
      retried: call.retried,
    });
  }

  private buildUrl(query: string): string {
    const { bounds } = SERVICE_AREA;
    const url = new URL('/search', this.options.baseUrl);

    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '0');
    url.searchParams.set('limit', String(MAX_RESULTS));
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set(
      'viewbox',
      [bounds.minLongitude, bounds.maxLatitude, bounds.maxLongitude, bounds.minLatitude].join(','),
    );
    url.searchParams.set('bounded', '1');

    return url.toString();
  }

  private toResults(places: NominatimPlace[]): GeocodingResult[] {
    const results: GeocodingResult[] = [];

    for (const place of places) {
      const latitude = Number(place.lat);
      const longitude = Number(place.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      results.push({
        formattedAddress: place.display_name ?? '',
        coordinates: Coordinates.create(latitude, longitude),
        confidence: typeof place.importance === 'number' ? place.importance : null,
      });
    }

    return results;
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

interface CallState {
  readonly started: number;
  readonly waitedMs: number;
  readonly retried: boolean;
}
