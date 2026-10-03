import type { Clock, IdGenerator, Logger } from '../../../../shared/application/ports/index.js';
import { ConflictError, ValidationError } from '../../../../shared/domain/errors/index.js';
import { slugify } from '../../../../shared/domain/text/index.js';
import { UsageMetricType } from '../../../metrics/domain/index.js';
import { CollectionPoint, type CollectionPointSnapshot } from '../../domain/collection-point.js';
import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';
import { SERVICE_AREA, isWithinServiceArea } from '../../domain/service-area.js';
import { Address } from '../../domain/value-objects/address.js';
import { Coordinates } from '../../domain/value-objects/coordinates.js';
import { Material } from '../../domain/value-objects/material.js';
import { Notes } from '../../domain/value-objects/notes.js';
import { OpeningHours } from '../../domain/value-objects/opening-hours.js';
import type { GeocodingService } from '../ports/geocoding-service.js';
import type { UsageMetricRecorder } from '../ports/usage-metric-recorder.js';

export interface CreateCollectionPointInput {
  readonly name: string;
  readonly address: string;
  readonly materials: string[];
  readonly openingHours?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
}

const MAX_CLIENT_COORDINATE_DRIFT_KM = 1;

const DUPLICATE_RADIUS_KM = 0.15;

export class CreateCollectionPoint {
  constructor(
    private readonly repository: CollectionPointRepository,
    private readonly geocoding: GeocodingService,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly metrics: UsageMetricRecorder,
    private readonly logger: Logger,
  ) {}

  async execute(input: CreateCollectionPointInput): Promise<CollectionPointSnapshot> {
    const address = Address.create(input.address);
    const materials = input.materials.map((material) => Material.create(material));
    const coordinates = await this.resolveCoordinates(address, input);

    if (!isWithinServiceArea(coordinates)) {
      throw new ValidationError(
        `No momento o PontoColeta atende apenas ${SERVICE_AREA.cityName}.`,
        'address',
      );
    }

    await this.assertNotDuplicated(input.name, coordinates);

    const point = CollectionPoint.create(
      {
        name: input.name,
        address,
        coordinates,
        materials,
        openingHours: OpeningHours.create(input.openingHours),
        notes: Notes.create(input.notes),
      },
      { id: this.idGenerator.generate(), now: this.clock.now() },
    );

    await this.repository.save(point);
    await this.recordMetric();

    return point.toSnapshot();
  }

  private async resolveCoordinates(
    address: Address,
    input: CreateCollectionPointInput,
  ): Promise<Coordinates> {
    const clientCoordinates =
      input.latitude !== undefined && input.longitude !== undefined
        ? Coordinates.create(input.latitude, input.longitude)
        : null;

    const [geocoded] = await this.geocoding.search(address.formatted);

    if (!geocoded) {
      if (clientCoordinates) {
        this.logger.warn('geocoding.miss.using_client_coordinates', {
          operation: 'CreateCollectionPoint',
        });
        return clientCoordinates;
      }
      throw new ValidationError('Não foi possível localizar esse endereço.', 'address');
    }

    if (
      clientCoordinates &&
      clientCoordinates.distanceKmTo(geocoded.coordinates) <= MAX_CLIENT_COORDINATE_DRIFT_KM
    ) {
      return clientCoordinates;
    }

    return geocoded.coordinates;
  }

  private async assertNotDuplicated(name: string, coordinates: Coordinates): Promise<void> {
    const neighbours = await this.repository.findNearby({
      centre: coordinates,
      radiusKm: DUPLICATE_RADIUS_KM,
      limit: 25,
    });

    const nameSlug = slugify(name);
    const duplicated = neighbours.some((point) => slugify(point.name) === nameSlug);

    if (duplicated) {
      throw new ConflictError('Esse ponto de coleta já está cadastrado.');
    }
  }

  private async recordMetric(): Promise<void> {
    try {
      await this.metrics.record(UsageMetricType.PointCreated);
    } catch (error) {
      this.logger.warn('metrics.record.failed', {
        operation: 'CreateCollectionPoint',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}
