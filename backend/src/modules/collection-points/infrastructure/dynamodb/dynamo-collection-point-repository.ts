import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type BatchGetCommandOutput,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Logger } from '../../../../shared/application/ports/index.js';
import { geohashCellsCovering } from '../../../../shared/domain/geo/index.js';
import { decodeCursor, encodeCursor } from '../../../../shared/infrastructure/dynamodb/index.js';
import type { CollectionPoint } from '../../domain/collection-point.js';
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
} from './collection-point-item.js';

export const INDEX_NAMES = {
  status: 'GSI1-status',
  geo: 'GSI2-geo',
} as const;

const MAX_BATCH_GET_KEYS = 100;
const MAX_BATCH_GET_ATTEMPTS = 5;
const BATCH_GET_BASE_DELAY_MS = 50;

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

  async save(point: CollectionPoint): Promise<void> {
    const item = toItem(point);
    const links = toMaterialLinkItems(point);

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.tableName, Item: item } },
          ...links.map((link) => ({ Put: { TableName: this.tableName, Item: link } })),
        ],
      }),
    );
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

  async findByMaterialSlug(
    materialSlug: string,
    request: PageRequest,
  ): Promise<Page<CollectionPoint>> {
    const links = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :partition AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':partition': keys.cityPartition(),
          ':prefix': keys.materialLinkPrefix(materialSlug),
        },
        Limit: request.limit,
        ExclusiveStartKey: decodeCursor(request.cursor),
      }),
    );

    const ids = (links.Items ?? [])
      .map((item) => pointIdFromMaterialLink(String(item.SK)))
      .filter((id) => id.length > 0);

    const points = await this.batchGetPoints(ids);

    return {
      items: points.filter((point) => point.isPubliclyVisible),
      nextCursor: encodeCursor(links.LastEvaluatedKey),
    };
  }

  async findNearby(query: NearbyQuery): Promise<CollectionPoint[]> {
    const cells = geohashCellsCovering(
      query.centre.latitude,
      query.centre.longitude,
      query.radiusKm,
      GEOHASH_PARTITION_PRECISION,
    );

    const pages = await Promise.all(
      cells.map((cell) =>
        this.client.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: INDEX_NAMES.geo,
            KeyConditionExpression: 'GSI2PK = :partition',
            ExpressionAttributeValues: { ':partition': keys.geoPartition(cell) },
          }),
        ),
      ),
    );

    const candidates = pages.flatMap((page) => (page.Items ?? []).map(toDomain));

    return candidates
      .map((point) => ({ point, distanceKm: point.distanceKmTo(query.centre) }))
      .filter((entry) => entry.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, query.limit)
      .map((entry) => entry.point);
  }

  private async batchGetPoints(ids: string[]): Promise<CollectionPoint[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];

    const byId = new Map<string, CollectionPoint>();

    // A BatchGet takes at most 100 keys, so the excess goes in further batches
    // rather than being dropped.
    for (let start = 0; start < uniqueIds.length; start += MAX_BATCH_GET_KEYS) {
      await this.collectBatch(uniqueIds.slice(start, start + MAX_BATCH_GET_KEYS), byId);
    }

    return uniqueIds
      .map((id) => byId.get(id))
      .filter((point): point is CollectionPoint => point !== undefined);
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
