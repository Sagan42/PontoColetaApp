import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../../src/shared/domain/errors/index.js';
import { CreateCollectionPoint } from '../../src/modules/collection-points/application/use-cases/create-collection-point.js';
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
