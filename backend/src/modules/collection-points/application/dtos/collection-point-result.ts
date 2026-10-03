import type { CollectionPointSnapshot } from '../../domain/collection-point.js';

export interface CollectionPointResult {
  readonly point: CollectionPointSnapshot;
  readonly distanceKm: number | null;
}

export interface SearchOrigin {
  readonly latitude: number;
  readonly longitude: number;
  readonly formattedAddress: string | null;
}
