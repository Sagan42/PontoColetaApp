import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/shared/domain/errors/index.js';
import { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import {
  CollectionPointStatus,
  parseCollectionPointStatus,
} from '../../src/modules/collection-points/domain/collection-point-status.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { OpeningHours } from '../../src/modules/collection-points/domain/value-objects/opening-hours.js';

const now = new Date('2026-08-22T12:00:00.000Z');

function buildPoint(
  overrides: Partial<{ name: string; materials: string[] }> = {},
): CollectionPoint {
  return CollectionPoint.create(
    {
      name: overrides.name ?? 'Ecoponto Centro',
      address: Address.create('Rua Pará, 500'),
      coordinates: Coordinates.create(-23.3103, -51.1628),
      materials: (overrides.materials ?? ['Pilhas', 'Baterias']).map((label) =>
        Material.create(label),
      ),
      openingHours: OpeningHours.create('Seg a Sex, 8h às 18h'),
    },
    { id: 'point-1', now },
  );
}

describe('CollectionPoint.create', () => {
  it('publishes new contributions immediately', () => {
    expect(buildPoint().status).toBe(CollectionPointStatus.Published);
    expect(buildPoint().isPubliclyVisible).toBe(true);
  });

  it('normalises the name', () => {
    expect(buildPoint({ name: '  Ecoponto   Centro ' }).name).toBe('Ecoponto Centro');
  });

  it('rejects a name that is too short', () => {
    expect(() => buildPoint({ name: 'ab' })).toThrow(ValidationError);
  });

  it('rejects a point without materials', () => {
    expect(() => buildPoint({ materials: [] })).toThrow(ValidationError);
  });

  it('removes duplicated materials regardless of spelling', () => {
    const point = buildPoint({ materials: ['Baterias', 'baterias', 'BATERIAS'] });
    expect(point.materials).toHaveLength(1);
    expect(point.materials[0]?.label).toBe('Baterias');
  });

  it('rejects more materials than allowed', () => {
    const materials = Array.from({ length: 11 }, (_, index) => 'Material ' + String(index));
    expect(() => buildPoint({ materials })).toThrow(ValidationError);
  });
});

describe('CollectionPoint behaviour', () => {
  it('matches materials by normalised slug', () => {
    const point = buildPoint({ materials: ['Óleo de cozinha'] });
    expect(point.acceptsMaterial('oleo de COZINHA')).toBe(true);
    expect(point.acceptsMaterial('Lâmpadas')).toBe(false);
  });

  it('computes the distance to a coordinate', () => {
    const point = buildPoint();
    expect(point.distanceKmTo(Coordinates.create(-23.3103, -51.1628))).toBe(0);
    expect(point.distanceKmTo(Coordinates.create(-23.32, -51.17))).toBeLessThan(2);
  });

  it('hides and republishes, updating the timestamp', () => {
    const point = buildPoint();
    const later = new Date('2026-08-23T12:00:00.000Z');

    point.hide(later);
    expect(point.status).toBe(CollectionPointStatus.Hidden);
    expect(point.isPubliclyVisible).toBe(false);
    expect(point.toSnapshot().updatedAt).toBe(later.toISOString());

    point.publish(later);
    expect(point.status).toBe(CollectionPointStatus.Published);
  });

  it('is idempotent when hiding twice', () => {
    const point = buildPoint();
    point.hide(new Date('2026-08-23T12:00:00.000Z'));
    point.hide(new Date('2026-08-24T12:00:00.000Z'));
    expect(point.toSnapshot().updatedAt).toBe('2026-08-23T12:00:00.000Z');
  });

  it('round-trips through its snapshot', () => {
    const original = buildPoint();
    const restored = CollectionPoint.restore(original.toSnapshot());
    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });
});

describe('parseCollectionPointStatus', () => {
  it('accepts known statuses', () => {
    expect(parseCollectionPointStatus('PUBLISHED')).toBe(CollectionPointStatus.Published);
    expect(parseCollectionPointStatus('HIDDEN')).toBe(CollectionPointStatus.Hidden);
  });

  it('rejects anything else', () => {
    expect(() => parseCollectionPointStatus('PENDING')).toThrow(ValidationError);
  });
});
