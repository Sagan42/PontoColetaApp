import type { Logger } from '../../../../shared/application/ports/index.js';
import { ValidationError } from '../../../../shared/domain/errors/index.js';
import { UsageMetricType } from '../../../metrics/domain/index.js';
import { AddressNotFoundError } from '../../domain/errors.js';
import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';
import { SERVICE_AREA } from '../../domain/service-area.js';
import { Coordinates } from '../../domain/value-objects/coordinates.js';
import type { CollectionPointResult, SearchOrigin } from '../dtos/collection-point-result.js';
import type { GeocodingService } from '../ports/geocoding-service.js';
import type { UsageMetricRecorder } from '../ports/usage-metric-recorder.js';

export interface SearchByLocationInput {
  readonly address?: string | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly radiusKm?: number | undefined;
  readonly limit: number;
}

export interface SearchByLocationOutput {
  readonly origin: SearchOrigin;
  readonly radiusKm: number;
  readonly items: CollectionPointResult[];
}

export class SearchCollectionPointsByLocation {
  constructor(
    private readonly repository: CollectionPointRepository,
    private readonly geocoding: GeocodingService,
    private readonly metrics: UsageMetricRecorder,
    private readonly logger: Logger,
  ) {}

  async execute(input: SearchByLocationInput): Promise<SearchByLocationOutput> {
    const origin = await this.resolveOrigin(input);
    const radiusKm = clampRadius(input.radiusKm);

    const points = await this.repository.findNearby({
      centre: origin.coordinates,
      radiusKm,
      limit: input.limit,
    });

    await this.recordMetric();

    return {
      origin: {
        latitude: origin.coordinates.latitude,
        longitude: origin.coordinates.longitude,
        formattedAddress: origin.formattedAddress,
      },
      radiusKm,
      items: points.map((point) => ({
        point: point.toSnapshot(),
        distanceKm: round2(point.distanceKmTo(origin.coordinates)),
      })),
    };
  }

  private async resolveOrigin(
    input: SearchByLocationInput,
  ): Promise<{ coordinates: Coordinates; formattedAddress: string | null }> {
    if (input.latitude !== undefined && input.longitude !== undefined) {
      return {
        coordinates: Coordinates.create(input.latitude, input.longitude),
        formattedAddress: null,
      };
    }

    const address = input.address?.trim();
    if (!address) {
      throw new ValidationError('Informe um endereço ou uma coordenada.', 'address');
    }

    const results = await this.geocoding.search(address);
    const first = results[0];
    if (!first) {
      throw new AddressNotFoundError();
    }

    return { coordinates: first.coordinates, formattedAddress: first.formattedAddress };
  }

  private async recordMetric(): Promise<void> {
    try {
      await this.metrics.record(UsageMetricType.SearchByAddress);
    } catch (error) {
      this.logger.warn('metrics.record.failed', {
        operation: 'SearchCollectionPointsByLocation',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}

function clampRadius(radiusKm: number | undefined): number {
  if (radiusKm === undefined) return SERVICE_AREA.defaultSearchRadiusKm;
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new ValidationError('Raio de busca inválido.', 'radiusKm');
  }
  return Math.min(radiusKm, SERVICE_AREA.maxSearchRadiusKm);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
