import type { CollectionPoint } from '../collection-point.js';
import type { CollectionPointStatus } from '../collection-point-status.js';
import type { Coordinates } from '../value-objects/coordinates.js';

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

export interface NearbyQuery {
  readonly centre: Coordinates;
  readonly radiusKm: number;
  readonly limit: number;
}

export interface CollectionPointRepository {
  save(point: CollectionPoint): Promise<void>;

  findById(id: string): Promise<CollectionPoint | null>;

  listPublished(request: PageRequest): Promise<Page<CollectionPoint>>;

  findByMaterialSlug(materialSlug: string, request: PageRequest): Promise<Page<CollectionPoint>>;

  findByStatus(status: CollectionPointStatus, request: PageRequest): Promise<Page<CollectionPoint>>;

  findNearby(query: NearbyQuery): Promise<CollectionPoint[]>;
}
