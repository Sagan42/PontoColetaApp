const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface GeohashBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export function encodeGeohash(latitude: number, longitude: number, precision: number): string {
  if (!Number.isInteger(precision) || precision < 1 || precision > 12) {
    throw new RangeError(`Unsupported geohash precision: ${precision}`);
  }

  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let isLongitudeBit = true;
  let bit = 0;
  let charIndex = 0;
  let hash = '';

  while (hash.length < precision) {
    if (isLongitudeBit) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (longitude >= mid) {
        charIndex = charIndex * 2 + 1;
        lonRange = [mid, lonRange[1]];
      } else {
        charIndex *= 2;
        lonRange = [lonRange[0], mid];
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (latitude >= mid) {
        charIndex = charIndex * 2 + 1;
        latRange = [mid, latRange[1]];
      } else {
        charIndex *= 2;
        latRange = [latRange[0], mid];
      }
    }

    isLongitudeBit = !isLongitudeBit;
    bit += 1;

    if (bit === 5) {
      hash += BASE32.charAt(charIndex);
      bit = 0;
      charIndex = 0;
    }
  }

  return hash;
}

export function decodeGeohashBounds(geohash: string): GeohashBounds {
  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let isLongitudeBit = true;

  for (const char of geohash.toLowerCase()) {
    const charIndex = BASE32.indexOf(char);
    if (charIndex === -1) {
      throw new RangeError(`Invalid geohash character: ${char}`);
    }

    for (let shift = 4; shift >= 0; shift -= 1) {
      const bitValue = (charIndex >> shift) & 1;
      if (isLongitudeBit) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        lonRange = bitValue === 1 ? [mid, lonRange[1]] : [lonRange[0], mid];
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        latRange = bitValue === 1 ? [mid, latRange[1]] : [latRange[0], mid];
      }
      isLongitudeBit = !isLongitudeBit;
    }
  }

  return {
    minLatitude: latRange[0],
    maxLatitude: latRange[1],
    minLongitude: lonRange[0],
    maxLongitude: lonRange[1],
  };
}

export function geohashCellsCovering(
  latitude: number,
  longitude: number,
  radiusKm: number,
  precision: number,
): string[] {
  const centre = encodeGeohash(latitude, longitude, precision);
  const bounds = decodeGeohashBounds(centre);
  const cellHeightKm = (bounds.maxLatitude - bounds.minLatitude) * 111.32;
  const cellWidthKm =
    (bounds.maxLongitude - bounds.minLongitude) * 111.32 * Math.cos((latitude * Math.PI) / 180);

  const rings = Math.max(
    1,
    Math.ceil(radiusKm / Math.max(cellHeightKm, 0.001)),
    Math.ceil(radiusKm / Math.max(cellWidthKm, 0.001)),
  );

  const latStep = bounds.maxLatitude - bounds.minLatitude;
  const lonStep = bounds.maxLongitude - bounds.minLongitude;
  const cells = new Set<string>();

  for (let latOffset = -rings; latOffset <= rings; latOffset += 1) {
    for (let lonOffset = -rings; lonOffset <= rings; lonOffset += 1) {
      const sampleLatitude = clampLatitude(latitude + latOffset * latStep);
      const sampleLongitude = wrapLongitude(longitude + lonOffset * lonStep);
      cells.add(encodeGeohash(sampleLatitude, sampleLongitude, precision));
    }
  }

  return [...cells].sort();
}

function clampLatitude(latitude: number): number {
  return Math.min(90, Math.max(-90, latitude));
}

function wrapLongitude(longitude: number): number {
  if (longitude > 180) return longitude - 360;
  if (longitude < -180) return longitude + 360;
  return longitude;
}
