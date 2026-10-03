import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
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

export class DynamoCollectionPointRepository implements CollectionPointRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
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
    if (ids.length === 0) return [];

    const uniqueIds = [...new Set(ids)].slice(0, MAX_BATCH_GET_KEYS);
    const result = await this.client.send(
      new BatchGetCommand({
        RequestItems: {
          [this.tableName]: {
            Keys: uniqueIds.map((id) => ({
              PK: keys.cityPartition(),
              SK: keys.pointSortKey(id),
            })),
          },
        },
      }),
    );

    const items = result.Responses?.[this.tableName] ?? [];
    const byId = new Map(items.map((item) => [String(item.id), toDomain(item)]));

    return uniqueIds
      .map((id) => byId.get(id))
      .filter((point): point is CollectionPoint => point !== undefined);
  }
}
