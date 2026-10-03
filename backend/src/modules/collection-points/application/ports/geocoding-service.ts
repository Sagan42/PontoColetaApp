import type { Coordinates } from '../../domain/value-objects/coordinates.js';

export interface GeocodingResult {
  readonly formattedAddress: string;
  readonly coordinates: Coordinates;
  readonly confidence: number | null;
}

export interface GeocodingService {
  search(address: string): Promise<GeocodingResult[]>;
}
