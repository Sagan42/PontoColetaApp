import { describe, expect, it } from 'vitest';
import { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { OpeningHours } from '../../src/modules/collection-points/domain/value-objects/opening-hours.js';
import {
  pointIdFromMaterialLink,
  toDomain,
  toItem,
  toMaterialLinkItems,
} from '../../src/modules/collection-points/infrastructure/dynamodb/collection-point-item.js';

const now = new Date('2026-08-22T12:00:00.000Z');

function buildPoint(): CollectionPoint {
  return CollectionPoint.create(
    {
      name: 'Ecoponto Centro',
      address: Address.create('Rua Pará, 500'),
      coordinates: Coordinates.create(-23.3103, -51.1628),
      materials: [Material.create('Pilhas'), Material.create('Óleo de cozinha')],
      openingHours: OpeningHours.create('Seg a Sex, 8h às 18h'),
    },
    { id: 'point-1', now },
  );
}

describe('collection point item mapping', () => {
  it('builds the primary and secondary keys', () => {
    const item = toItem(buildPoint());

    expect(item.PK).toBe('CITY#LONDRINA');
    expect(item.SK).toBe('POINT#point-1');
    expect(item.GSI1PK).toBe('STATUS#PUBLISHED');
    expect(item.GSI1SK).toBe('2026-08-22T12:00:00.000Z#point-1');
    expect(item.GSI2PK).toBe('GEO#6gge');
    expect(item.GSI2SK).toBe('POINT#point-1');
  });

  it('stores a full precision geohash whose prefix is the geo partition', () => {
    const item = toItem(buildPoint());

    expect(item.geohash).toHaveLength(9);
    expect(item.GSI2PK).toBe('GEO#' + item.geohash.slice(0, 4));
  });

  it('drops the geo index attributes for hidden points, keeping the index sparse', () => {
    const point = buildPoint();
    point.hide(new Date('2026-08-23T12:00:00.000Z'));

    const item = toItem(point);

    expect(item.GSI2PK).toBeUndefined();
    expect(item.GSI2SK).toBeUndefined();
    expect(item.GSI1PK).toBe('STATUS#HIDDEN');
  });

  it('round-trips a point through the stored representation', () => {
    const original = buildPoint();
    const restored = toDomain(toItem(original));

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });

  it('rejects a corrupted item instead of returning a wrong point', () => {
    const item = { ...toItem(buildPoint()), latitude: 'não é número' };

    expect(() => toDomain(item)).toThrow();
  });

  it('creates one auxiliary item per accepted material', () => {
    const links = toMaterialLinkItems(buildPoint());

    expect(links.map((link) => link.SK)).toEqual([
      'MATERIAL#pilhas#POINT#point-1',
      'MATERIAL#oleo-de-cozinha#POINT#point-1',
    ]);
    expect(links.every((link) => link.PK === 'CITY#LONDRINA')).toBe(true);
  });

  it('extracts the point id back from an auxiliary sort key', () => {
    expect(pointIdFromMaterialLink('MATERIAL#oleo-de-cozinha#POINT#point-1')).toBe('point-1');
    expect(pointIdFromMaterialLink('POINT#point-1')).toBe('');
  });
});
