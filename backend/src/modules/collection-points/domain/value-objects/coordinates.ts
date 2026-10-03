import { ValidationError } from '../../../../shared/domain/errors/index.js';
import { haversineDistanceKm, type LatLng } from '../../../../shared/domain/geo/index.js';

export class Coordinates implements LatLng {
  private constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {
    Object.freeze(this);
  }

  static create(latitude: number, longitude: number): Coordinates {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ValidationError('Latitude inválida.', 'latitude');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ValidationError('Longitude inválida.', 'longitude');
    }

    return new Coordinates(round6(latitude), round6(longitude));
  }

  distanceKmTo(other: LatLng): number {
    return haversineDistanceKm(this, other);
  }

  equals(other: Coordinates): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }

  toString(): string {
    return `${this.latitude},${this.longitude}`;
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
