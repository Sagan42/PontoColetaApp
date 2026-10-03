import { describe, expect, it } from 'vitest';
import {
  decodeGeohashBounds,
  encodeGeohash,
  geohashCellsCovering,
  haversineDistanceKm,
} from '../../src/shared/domain/geo/index.js';

describe('geohash', () => {
  it('encodes a known coordinate', () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('encodes central Londrina into a stable cell', () => {
    const hash = encodeGeohash(-23.3103, -51.1628, 9);
    expect(hash).toHaveLength(9);
    expect(encodeGeohash(-23.3104, -51.1629, 4)).toBe(hash.slice(0, 4));
  });

  it('decodes bounds that contain the encoded point', () => {
    const bounds = decodeGeohashBounds(encodeGeohash(-23.3103, -51.1628, 6));
    expect(-23.3103).toBeGreaterThanOrEqual(bounds.minLatitude);
    expect(-23.3103).toBeLessThanOrEqual(bounds.maxLatitude);
    expect(-51.1628).toBeGreaterThanOrEqual(bounds.minLongitude);
    expect(-51.1628).toBeLessThanOrEqual(bounds.maxLongitude);
  });

  it('rejects an unsupported precision', () => {
    expect(() => encodeGeohash(0, 0, 0)).toThrow(RangeError);
  });
});

describe('geohashCellsCovering', () => {
  it('returns the centre cell plus one ring for a city-sized radius', () => {
    const cells = geohashCellsCovering(-23.3103, -51.1628, 5, 4);
    expect(cells).toContain(encodeGeohash(-23.3103, -51.1628, 4));
    expect(cells.length).toBeLessThanOrEqual(9);
  });

  it('covers every point inside the radius', () => {
    const centreLat = -23.3103;
    const centreLon = -51.1628;
    const radiusKm = 8;
    const cells = new Set(geohashCellsCovering(centreLat, centreLon, radiusKm, 4));

    for (let angle = 0; angle < 360; angle += 15) {
      const radians = (angle * Math.PI) / 180;
      const latitude = centreLat + (radiusKm / 111.32) * Math.cos(radians);
      const longitude =
        centreLon +
        (radiusKm / (111.32 * Math.cos((centreLat * Math.PI) / 180))) * Math.sin(radians);

      expect(cells.has(encodeGeohash(latitude, longitude, 4))).toBe(true);
    }
  });
});

describe('haversineDistanceKm', () => {
  it('returns zero for the same point', () => {
    const point = { latitude: -23.3103, longitude: -51.1628 };
    expect(haversineDistanceKm(point, point)).toBe(0);
  });

  it('matches a known distance between Londrina and Maringá', () => {
    const distance = haversineDistanceKm(
      { latitude: -23.3103, longitude: -51.1628 },
      { latitude: -23.4205, longitude: -51.9331 },
    );
    expect(distance).toBeGreaterThan(77);
    expect(distance).toBeLessThan(81);
  });

  it('is symmetric', () => {
    const a = { latitude: -23.31, longitude: -51.16 };
    const b = { latitude: -23.35, longitude: -51.2 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10);
  });
});
