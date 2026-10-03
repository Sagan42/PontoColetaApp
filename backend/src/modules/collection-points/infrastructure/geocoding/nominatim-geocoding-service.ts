import type { Logger } from '../../../../shared/application/ports/index.js';
import { ExternalServiceError } from '../../../../shared/domain/errors/index.js';
import type {
  GeocodingResult,
  GeocodingService,
} from '../../application/ports/geocoding-service.js';
import { SERVICE_AREA } from '../../domain/service-area.js';
import { Coordinates } from '../../domain/value-objects/coordinates.js';

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

const MAX_RESULTS = 5;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

export class NominatimGeocodingService implements GeocodingService {
  private readonly cache = new Map<string, { expiresAt: number; results: GeocodingResult[] }>();

  constructor(
    private readonly options: NominatimOptions,
    private readonly logger: Logger,
  ) {}

  async search(address: string): Promise<GeocodingResult[]> {
    const query = address.trim();
    if (query.length === 0) return [];

    const cached = this.readFromCache(query);
    if (cached) return cached;

    const url = this.buildUrl(query);
    const started = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      this.logger.warn('geocoding.request.failed', {
        operation: 'NominatimGeocodingService.search',
        durationMs: Date.now() - started,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new ExternalServiceError(
        'Não foi possível consultar o serviço de endereços. Tente novamente.',
        'nominatim',
      );
    }

    if (!response.ok) {
      this.logger.warn('geocoding.request.rejected', {
        operation: 'NominatimGeocodingService.search',
        status: response.status,
        durationMs: Date.now() - started,
      });
      throw new ExternalServiceError(
        'Não foi possível consultar o serviço de endereços. Tente novamente.',
        'nominatim',
      );
    }

    const payload = (await response.json()) as NominatimPlace[];
    const results = this.toResults(payload);

    this.writeToCache(query, results);
    this.logger.debug('geocoding.request.completed', {
      operation: 'NominatimGeocodingService.search',
      durationMs: Date.now() - started,
      resultCount: results.length,
    });

    return results;
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
    if (entry.expiresAt < Date.now()) {
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
    this.cache.set(query, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  }
}
