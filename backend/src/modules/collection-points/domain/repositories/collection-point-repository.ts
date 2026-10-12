import type { CollectionPoint } from '../collection-point.js';
import type { CollectionPointStatus } from '../collection-point-status.js';
import type { Coordinates } from '../value-objects/coordinates.js';

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface Page<T> {
  readonly items: T[];

  /**
   * Opaque key to resume from, or `null` once the source has been read to its
   * end. A non-null cursor does not promise further items, only that the source
   * was not known to be finished.
   */
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

  /**
   * Publicly visible points that accept the material, in a stable order.
   *
   * `limit` counts the points in `items`, not the internal index entries read
   * to find them: as long as that many visible points remain ahead of the
   * cursor, the page carries `limit` of them. Points hidden from the public
   * are skipped without spending the caller's budget.
   *
   * `nextCursor` is `null` only once the material has been read to its end, so
   * a non-null cursor can still yield an empty page. It resumes right after the
   * last entry this call consumed, so walking the cursors neither repeats nor
   * skips a point, even when a page stopped mid-way through the entries it read.
   *
   * One exception to `limit`: the scan gives up after a bounded number of
   * internal pages, so a material whose entries are overwhelmingly hidden can
   * return fewer than `limit` points with a non-null cursor. Calling again with
   * that cursor makes progress.
   */
  findByMaterialSlug(materialSlug: string, request: PageRequest): Promise<Page<CollectionPoint>>;

  findByStatus(status: CollectionPointStatus, request: PageRequest): Promise<Page<CollectionPoint>>;

  findNearby(query: NearbyQuery): Promise<CollectionPoint[]>;
}
