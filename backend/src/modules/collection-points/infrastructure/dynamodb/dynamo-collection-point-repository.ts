import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type BatchGetCommandOutput,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Logger } from '../../../../shared/application/ports/index.js';
import { ConflictError } from '../../../../shared/domain/errors/index.js';
import { geohashCellsCovering } from '../../../../shared/domain/geo/index.js';
import {
  decodeCursor,
  encodeCursor,
  type DynamoKey,
} from '../../../../shared/infrastructure/dynamodb/index.js';
import { DUPLICATE_POINT_MESSAGE, type CollectionPoint } from '../../domain/collection-point.js';
import type { CollectionPointStatus } from '../../domain/collection-point-status.js';
import { CollectionPointStatus as Status } from '../../domain/collection-point-status.js';
import type {
  CollectionPointRepository,
  NearbyQuery,
  Page,
  PageRequest,
} from '../../domain/repositories/collection-point-repository.js';
import {
  GEOHASH_PARTITION_PRECISION,
  keys,
  pointIdFromMaterialLink,
  toDomain,
  toItem,
  toMaterialLinkItems,
  toUniquenessItem,
} from './collection-point-item.js';

export const INDEX_NAMES = {
  status: 'GSI1-status',
  geo: 'GSI2-geo',
} as const;

const MAX_BATCH_GET_KEYS = 100;
const MAX_BATCH_GET_ATTEMPTS = 5;
const BATCH_GET_BASE_DELAY_MS = 50;
const MAX_MATERIAL_LINK_PAGES = 5;
const MAX_GEO_PAGES_PER_CELL = 10;

interface CancellationReason {
  Code?: string;
}

/**
 * A cancelled transaction reports one reason per item. Only the uniqueness Put
 * carries a condition, so a ConditionalCheckFailed among them means exactly
 * one thing: someone else already claimed this place.
 */
function isConditionalCheckFailure(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return false;

  const reasons = (error as { CancellationReasons?: CancellationReason[] }).CancellationReasons;
  return (reasons ?? []).some((reason) => reason.Code === 'ConditionalCheckFailed');
}

type BatchGetKeys = NonNullable<
  NonNullable<NonNullable<BatchGetCommandOutput['UnprocessedKeys']>[string]>['Keys']
>;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class DynamoCollectionPointRepository implements CollectionPointRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
    private readonly wait: (ms: number) => Promise<void> = waitMs,
  ) {}

  /**
   * The point, its material links and its uniqueness claim go in one
   * transaction. The claim carries attribute_not_exists, so two concurrent
   * registrations of the same name at the same place cannot both commit: the
   * loser is cancelled by the database, not by a check that raced.
   */
  async save(point: CollectionPoint): Promise<void> {
    const item = toItem(point);
    const links = toMaterialLinkItems(point);
    const uniqueness = toUniquenessItem(point);

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: this.tableName, Item: item } },
            ...links.map((link) => ({ Put: { TableName: this.tableName, Item: link } })),
            {
              Put: {
                TableName: this.tableName,
                Item: uniqueness,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (!isConditionalCheckFailure(error)) throw error;

      this.logger.warn('collection_point.save.conflict', {
        operation: 'DynamoCollectionPointRepository.save',
        nameSlug: uniqueness.nameSlug,
        geohashCell: uniqueness.geohashCell,
      });

      throw new ConflictError(DUPLICATE_POINT_MESSAGE);
    }
  }

  async findById(id: string): Promise<CollectionPoint | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: keys.cityPartition(), SK: keys.pointSortKey(id) },
      }),
    );

    return result.Item ? toDomain(result.Item) : null;
  }

  listPublished(request: PageRequest): Promise<Page<CollectionPoint>> {
    return this.findByStatus(Status.Published, request);
  }

  async findByStatus(
    status: CollectionPointStatus,
    request: PageRequest,
  ): Promise<Page<CollectionPoint>> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: INDEX_NAMES.status,
        KeyConditionExpression: 'GSI1PK = :partition',
        ExpressionAttributeValues: { ':partition': keys.statusPartition(status) },
        ScanIndexForward: false,
        Limit: request.limit,
        ExclusiveStartKey: decodeCursor(request.cursor),
      }),
    );

    return {
      items: (result.Items ?? []).map(toDomain),
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    };
  }

  /**
   * The material links are an index, not the answer: a link can point at a
   * hidden point, so a page of links yields an unknown number of visible
   * points. Pages of links are therefore read until `limit` published points
   * are gathered, and the cursor returned is the link actually stopped on, not
   * the end of the last page read.
   */
  async findByMaterialSlug(
    materialSlug: string,
    request: PageRequest,
  ): Promise<Page<CollectionPoint>> {
    const points: CollectionPoint[] = [];
    let startKey = decodeCursor(request.cursor);
    let lastConsumed: DynamoKey | undefined;
    let exhausted = false;
    let pagesRead = 0;

    while (points.length < request.limit) {
      if (pagesRead >= MAX_MATERIAL_LINK_PAGES) {
        this.logger.warn('Material search hit the link page cap before filling the limit', {
          operation: 'DynamoCollectionPointRepository.findByMaterialSlug',
          materialSlug,
          limit: request.limit,
          collected: points.length,
          pagesRead,
        });
        break;
      }

      pagesRead += 1;

      const links = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :partition AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':partition': keys.cityPartition(),
            ':prefix': keys.materialLinkPrefix(materialSlug),
          },
          Limit: request.limit,
          ExclusiveStartKey: startKey,
        }),
      );

      const items = links.Items ?? [];
      const byId = await this.batchGetPoints(
        items.map((item) => pointIdFromMaterialLink(String(item.SK))),
      );

      let leftovers = false;

      for (const item of items) {
        if (points.length >= request.limit) {
          leftovers = true;
          break;
        }

        lastConsumed = { PK: item.PK, SK: item.SK };

        const point = byId.get(pointIdFromMaterialLink(String(item.SK)));
        if (point?.isPubliclyVisible) points.push(point);
      }

      startKey = links.LastEvaluatedKey;

      // Nothing left in this page and none promised beyond it: the partition is
      // over, so the caller gets a null cursor instead of one more empty page.
      if (!leftovers && !startKey) {
        exhausted = true;
        break;
      }
    }

    return {
      items: points,
      nextCursor: exhausted ? null : encodeCursor(lastConsumed),
    };
  }

  /**
   * Every candidate in the covering cells has to be read before the results can
   * be ranked, because the nearest point may sit on any page of any cell. A
   * single Query returns at most 1 MB, so each cell is drained page by page
   * rather than judged by its first page alone.
   */
  async findNearby(query: NearbyQuery): Promise<CollectionPoint[]> {
    const cells = geohashCellsCovering(
      query.centre.latitude,
      query.centre.longitude,
      query.radiusKm,
      GEOHASH_PARTITION_PRECISION,
    );

    const perCell = await Promise.all(cells.map((cell) => this.readGeoCell(cell)));

    return perCell
      .flat()
      .map((point) => ({ point, distanceKm: point.distanceKmTo(query.centre) }))
      .filter((entry) => entry.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, query.limit)
      .map((entry) => entry.point);
  }

  private async readGeoCell(cell: string): Promise<CollectionPoint[]> {
    const points: CollectionPoint[] = [];
    let startKey: DynamoKey | undefined;
    let pagesRead = 0;

    for (;;) {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: INDEX_NAMES.geo,
          KeyConditionExpression: 'GSI2PK = :partition',
          ExpressionAttributeValues: { ':partition': keys.geoPartition(cell) },
          ExclusiveStartKey: startKey,
        }),
      );

      for (const item of page.Items ?? []) points.push(toDomain(item));

      pagesRead += 1;
      startKey = page.LastEvaluatedKey;

      if (!startKey) break;

      if (pagesRead >= MAX_GEO_PAGES_PER_CELL) {
        this.logger.warn('Nearby search stopped at the page cap with the cell unread', {
          operation: 'DynamoCollectionPointRepository.findNearby',
          cell,
          pagesRead,
        });
        break;
      }
    }

    return points;
  }

  /**
   * Reads the points behind a set of ids, keyed by id so the caller can resolve
   * each index entry on its own. The ids are deduplicated only to build the
   * request, because BatchGetItem rejects a batch that repeats a key.
   */
  private async batchGetPoints(ids: string[]): Promise<Map<string, CollectionPoint>> {
    const byId = new Map<string, CollectionPoint>();
    const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) return byId;

    // A BatchGet takes at most 100 keys, so the excess goes in further batches
    // rather than being dropped.
    for (let start = 0; start < uniqueIds.length; start += MAX_BATCH_GET_KEYS) {
      await this.collectBatch(uniqueIds.slice(start, start + MAX_BATCH_GET_KEYS), byId);
    }

    return byId;
  }

  /**
   * DynamoDB answers a BatchGet partially when it throttles the request or when
   * the batch would exceed 16 MB, handing the keys it skipped back in
   * UnprocessedKeys. Resending those with exponential backoff is what keeps
   * points from disappearing from a material search without a trace.
   */
  private async collectBatch(ids: string[], byId: Map<string, CollectionPoint>): Promise<void> {
    let pending: BatchGetKeys = ids.map((id) => ({
      PK: keys.cityPartition(),
      SK: keys.pointSortKey(id),
    }));

    for (let attempt = 0; attempt < MAX_BATCH_GET_ATTEMPTS && pending.length > 0; attempt += 1) {
      if (attempt > 0) await this.wait(BATCH_GET_BASE_DELAY_MS * 2 ** (attempt - 1));

      const result = await this.client.send(
        new BatchGetCommand({ RequestItems: { [this.tableName]: { Keys: pending } } }),
      );

      for (const item of result.Responses?.[this.tableName] ?? []) {
        byId.set(String(item.id), toDomain(item));
      }

      pending = result.UnprocessedKeys?.[this.tableName]?.Keys ?? [];
    }

    if (pending.length > 0) {
      this.logger.warn('BatchGet left keys unprocessed after exhausting the retries', {
        operation: 'DynamoCollectionPointRepository.batchGetPoints',
        table: this.tableName,
        unprocessedKeys: pending.length,
        attempts: MAX_BATCH_GET_ATTEMPTS,
      });
    }
  }
}
