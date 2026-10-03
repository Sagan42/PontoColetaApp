import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/shared/domain/errors/index.js';
import { GetCollectionPoint } from '../../src/modules/collection-points/application/use-cases/get-collection-point.js';
import { ListCollectionPoints } from '../../src/modules/collection-points/application/use-cases/list-collection-points.js';
import { SearchCollectionPointsByLocation } from '../../src/modules/collection-points/application/use-cases/search-collection-points-by-location.js';
import { SearchCollectionPointsByMaterial } from '../../src/modules/collection-points/application/use-cases/search-collection-points-by-material.js';
import { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import { AddressNotFoundError } from '../../src/modules/collection-points/domain/errors.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { UsageMetricType } from '../../src/modules/metrics/domain/index.js';
import {
  FakeGeocodingService,
  InMemoryCollectionPointRepository,
  RecordingMetricRecorder,
  silentLogger,
} from '../support/fakes.js';

const now = new Date('2026-08-22T12:00:00.000Z');

function makePoint(
  id: string,
  name: string,
  materials: string[],
  latitude: number,
  longitude: number,
): CollectionPoint {
  return CollectionPoint.create(
    {
      name,
      address: Address.create('Rua Pará, 500'),
      coordinates: Coordinates.create(latitude, longitude),
      materials: materials.map((label) => Material.create(label)),
    },
    { id, now },
  );
}

describe('collection point queries', () => {
  let repository: InMemoryCollectionPointRepository;
  let metrics: RecordingMetricRecorder;

  beforeEach(async () => {
    repository = new InMemoryCollectionPointRepository();
    metrics = new RecordingMetricRecorder();

    await repository.save(makePoint('a', 'Ecoponto Centro', ['Pilhas'], -23.3103, -51.1628));
    await repository.save(
      makePoint('b', 'Supermercado Norte', ['Óleo de cozinha'], -23.29, -51.15),
    );
    await repository.save(makePoint('c', 'Loja Sul', ['Pilhas', 'Lâmpadas'], -23.4, -51.25));
  });

  describe('GetCollectionPoint', () => {
    it('returns a published point', async () => {
      const point = await new GetCollectionPoint(repository).execute('a');
      expect(point.name).toBe('Ecoponto Centro');
    });

    it('fails for an unknown id', async () => {
      await expect(new GetCollectionPoint(repository).execute('zzz')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('hides points that are not publicly visible', async () => {
      const point = repository.points.get('a');
      point?.hide(now);

      await expect(new GetCollectionPoint(repository).execute('a')).rejects.toThrow(NotFoundError);
    });
  });

  describe('ListCollectionPoints', () => {
    it('returns published points without distance', async () => {
      const result = await new ListCollectionPoints(repository).execute({ limit: 50 });

      expect(result.items).toHaveLength(3);
      expect(result.items[0]?.distanceKm).toBeNull();
    });

    it('honours the limit', async () => {
      const result = await new ListCollectionPoints(repository).execute({ limit: 2 });
      expect(result.items).toHaveLength(2);
    });
  });

  describe('SearchCollectionPointsByMaterial', () => {
    it('finds points by normalised material', async () => {
      const useCase = new SearchCollectionPointsByMaterial(repository, metrics, silentLogger);
      const result = await useCase.execute({ material: 'ÓLEO DE COZINHA', limit: 50 });

      expect(result.material.slug).toBe('oleo-de-cozinha');
      expect(result.items.map((item) => item.point.id)).toEqual(['b']);
    });

    it('returns an empty list when nothing accepts the material', async () => {
      const useCase = new SearchCollectionPointsByMaterial(repository, metrics, silentLogger);
      const result = await useCase.execute({ material: 'Entulho', limit: 50 });

      expect(result.items).toEqual([]);
    });

    it('counts the search', async () => {
      const useCase = new SearchCollectionPointsByMaterial(repository, metrics, silentLogger);
      await useCase.execute({ material: 'Pilhas', limit: 50 });

      expect(metrics.recorded).toEqual([UsageMetricType.SearchByMaterial]);
    });
  });

  describe('SearchCollectionPointsByLocation', () => {
    it('resolves an address and orders results by distance', async () => {
      const geocoding = new FakeGeocodingService();
      const useCase = new SearchCollectionPointsByLocation(
        repository,
        geocoding,
        metrics,
        silentLogger,
      );

      const result = await useCase.execute({ address: 'Rua Pará, 500', limit: 50 });

      expect(result.origin.formattedAddress).toContain('Londrina');
      expect(result.items.map((item) => item.point.id)).toEqual(['a', 'b']);
      expect(result.items[0]?.distanceKm).toBe(0);
      expect(result.items[1]?.distanceKm).toBeGreaterThan(0);
    });

    it('accepts explicit coordinates without geocoding', async () => {
      const geocoding = new FakeGeocodingService();
      const useCase = new SearchCollectionPointsByLocation(
        repository,
        geocoding,
        metrics,
        silentLogger,
      );

      const result = await useCase.execute({
        latitude: -23.4,
        longitude: -51.25,
        radiusKm: 1,
        limit: 50,
      });

      expect(geocoding.queries).toEqual([]);
      expect(result.items.map((item) => item.point.id)).toEqual(['c']);
    });

    it('caps the radius at the service area limit', async () => {
      const useCase = new SearchCollectionPointsByLocation(
        repository,
        new FakeGeocodingService(),
        metrics,
        silentLogger,
      );

      const result = await useCase.execute({ address: 'Centro', radiusKm: 500, limit: 50 });
      expect(result.radiusKm).toBe(20);
    });

    it('fails when the address cannot be located', async () => {
      const geocoding = new FakeGeocodingService();
      geocoding.respondWith([]);

      const useCase = new SearchCollectionPointsByLocation(
        repository,
        geocoding,
        metrics,
        silentLogger,
      );

      await expect(useCase.execute({ address: 'Rua Inexistente', limit: 50 })).rejects.toThrow(
        AddressNotFoundError,
      );
    });
  });
});
