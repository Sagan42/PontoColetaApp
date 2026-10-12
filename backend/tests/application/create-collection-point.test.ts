import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../../src/shared/domain/errors/index.js';
import { CreateCollectionPoint } from '../../src/modules/collection-points/application/use-cases/create-collection-point.js';
import {
  DUPLICATE_POINT_MESSAGE,
  type CollectionPoint,
} from '../../src/modules/collection-points/domain/collection-point.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { UsageMetricType } from '../../src/modules/metrics/domain/index.js';
import {
  FakeGeocodingService,
  FixedClock,
  InMemoryCollectionPointRepository,
  RecordingMetricRecorder,
  SequentialIdGenerator,
  silentLogger,
} from '../support/fakes.js';

const validInput = {
  name: 'Ecoponto Centro',
  address: 'Rua Pará, 500',
  materials: ['Pilhas', 'Baterias'],
  openingHours: 'Seg a Sex, 8h às 18h',
  notes: 'Entrada pela lateral',
};

describe('CreateCollectionPoint', () => {
  let repository: InMemoryCollectionPointRepository;
  let geocoding: FakeGeocodingService;
  let metrics: RecordingMetricRecorder;
  let useCase: CreateCollectionPoint;

  beforeEach(() => {
    repository = new InMemoryCollectionPointRepository();
    geocoding = new FakeGeocodingService();
    metrics = new RecordingMetricRecorder();
    useCase = new CreateCollectionPoint(
      repository,
      geocoding,
      new SequentialIdGenerator(),
      new FixedClock(new Date('2026-08-22T12:00:00.000Z')),
      metrics,
      silentLogger,
    );
  });

  it('stores a published point with coordinates resolved by the backend', async () => {
    const point = await useCase.execute(validInput);

    expect(point.id).toBe('point-1');
    expect(point.status).toBe('PUBLISHED');
    expect(point.latitude).toBe(-23.3103);
    expect(point.longitude).toBe(-51.1628);
    expect(point.materials.map((material) => material.slug)).toEqual(['pilhas', 'baterias']);
    expect(repository.points.size).toBe(1);
  });

  it('sends the full address, including the city, to the geocoder', async () => {
    await useCase.execute(validInput);
    expect(geocoding.queries).toEqual(['Rua Pará, 500, Londrina, PR']);
  });

  it('counts the contribution', async () => {
    await useCase.execute(validInput);
    expect(metrics.recorded).toEqual([UsageMetricType.PointCreated]);
  });

  it('keeps the app coordinates when they agree with the geocoded address', async () => {
    const point = await useCase.execute({
      ...validInput,
      latitude: -23.3105,
      longitude: -51.163,
    });

    expect(point.latitude).toBe(-23.3105);
    expect(point.longitude).toBe(-51.163);
  });

  it('discards app coordinates that disagree with the address', async () => {
    const point = await useCase.execute({
      ...validInput,
      latitude: -23.55,
      longitude: -46.63,
    });

    expect(point.latitude).toBe(-23.3103);
    expect(point.longitude).toBe(-51.1628);
  });

  it('rejects an address that cannot be located', async () => {
    geocoding.respondWith([]);

    await expect(useCase.execute(validInput)).rejects.toThrow(ValidationError);
  });

  it('rejects a point outside the service area', async () => {
    geocoding.respondWith([
      {
        formattedAddress: 'Avenida Paulista, São Paulo',
        coordinates: Coordinates.create(-23.5613, -46.6565),
        confidence: 0.9,
      },
    ]);

    await expect(useCase.execute(validInput)).rejects.toThrow(/Londrina/);
  });

  it('rejects a duplicated point at the same place', async () => {
    await useCase.execute(validInput);

    await expect(useCase.execute({ ...validInput, name: 'ECOPONTO CENTRO' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('accepts a different point at the same place', async () => {
    await useCase.execute(validInput);
    const second = await useCase.execute({ ...validInput, name: 'Farmácia Central' });

    expect(second.id).toBe('point-2');
  });

  it('does not fail the contribution when metrics are unavailable', async () => {
    const failingMetrics = {
      record: () => Promise.reject(new Error('dynamo unavailable')),
    };
    const resilient = new CreateCollectionPoint(
      repository,
      geocoding,
      new SequentialIdGenerator(),
      new FixedClock(new Date('2026-08-22T12:00:00.000Z')),
      failingMetrics,
      silentLogger,
    );

    await expect(resilient.execute(validInput)).resolves.toMatchObject({ status: 'PUBLISHED' });
  });
});

/**
 * Stands in for the transactional claim: the proximity check sees nothing (as it
 * does when two registrations race), and the store itself refuses the second
 * write of a name it already holds.
 */
class RacingRepository extends InMemoryCollectionPointRepository {
  readonly saveAttempts: string[] = [];
  private readonly claimed = new Set<string>();

  override save(point: CollectionPoint): Promise<void> {
    this.saveAttempts.push(point.name);

    if (this.claimed.has(point.name)) {
      return Promise.reject(new ConflictError(DUPLICATE_POINT_MESSAGE));
    }

    this.claimed.add(point.name);
    return super.save(point);
  }

  // A racing registration cannot see the other one yet.
  override findNearby(): Promise<CollectionPoint[]> {
    return Promise.resolve([]);
  }
}

describe('CreateCollectionPoint under a concurrent duplicate', () => {
  let repository: RacingRepository;
  let metrics: RecordingMetricRecorder;
  let useCase: CreateCollectionPoint;

  beforeEach(() => {
    repository = new RacingRepository();
    metrics = new RecordingMetricRecorder();
    useCase = new CreateCollectionPoint(
      repository,
      new FakeGeocodingService(),
      new SequentialIdGenerator(),
      new FixedClock(new Date('2026-08-22T12:00:00.000Z')),
      metrics,
      silentLogger,
    );
  });

  it('lets exactly one of two simultaneous registrations through', async () => {
    const settled = await Promise.allSettled([
      useCase.execute(validInput),
      useCase.execute(validInput),
    ]);

    const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
    const rejected = settled.filter((entry) => entry.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // Both got past the pre-check; the store is what separated them.
    expect(repository.saveAttempts).toHaveLength(2);
    expect(repository.points.size).toBe(1);
  });

  it('reports the loser with the same message and code as the pre-check', async () => {
    await useCase.execute(validInput);

    const failure = useCase.execute(validInput);

    await expect(failure).rejects.toBeInstanceOf(ConflictError);
    await expect(failure).rejects.toThrow('Esse ponto de coleta já está cadastrado.');
    await expect(failure).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('does not count a contribution that lost the race', async () => {
    await useCase.execute(validInput);
    metrics.recorded.length = 0;

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(ConflictError);

    expect(metrics.recorded).toEqual([]);
  });

  it('still registers a different point at the same place', async () => {
    await useCase.execute(validInput);

    await expect(
      useCase.execute({ ...validInput, name: 'Cooperativa Norte' }),
    ).resolves.toMatchObject({ name: 'Cooperativa Norte' });
    expect(repository.points.size).toBe(2);
  });
});

describe('CreateCollectionPoint pre-check', () => {
  it('answers without attempting a write when the duplicate is already visible', async () => {
    const repository = new RecordingRepository();
    const useCase = new CreateCollectionPoint(
      repository,
      new FakeGeocodingService(),
      new SequentialIdGenerator(),
      new FixedClock(new Date('2026-08-22T12:00:00.000Z')),
      new RecordingMetricRecorder(),
      silentLogger,
    );

    await useCase.execute(validInput);
    repository.saveAttempts.length = 0;

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(ConflictError);
    // The fast path: the person hears back without the store being touched.
    expect(repository.saveAttempts).toEqual([]);
  });
});

class RecordingRepository extends InMemoryCollectionPointRepository {
  readonly saveAttempts: string[] = [];

  override save(point: CollectionPoint): Promise<void> {
    this.saveAttempts.push(point.name);
    return super.save(point);
  }
}
