import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConflictError } from '../../src/shared/domain/errors/index.js';
import { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { DynamoCollectionPointRepository } from '../../src/modules/collection-points/infrastructure/dynamodb/dynamo-collection-point-repository.js';
import {
  GEOHASH_PARTITION_PRECISION,
  keys,
  toItem,
} from '../../src/modules/collection-points/infrastructure/dynamodb/collection-point-item.js';
import { encodeGeohash } from '../../src/shared/domain/geo/index.js';
import { decodeCursor } from '../../src/shared/infrastructure/dynamodb/index.js';
import { createRecordingLogger, silentLogger } from '../support/fakes.js';

const TABLE = 'pontocoleta-test';
const MAX_KEYS_PER_BATCH = 100;
const now = new Date('2026-08-22T12:00:00.000Z');

function buildPoint(id: string, latitude = -23.3103, longitude = -51.1628): CollectionPoint {
  return CollectionPoint.create(
    {
      name: 'Ecoponto ' + id,
      address: Address.create('Rua Pará, 500'),
      coordinates: Coordinates.create(latitude, longitude),
      materials: [Material.create('Pilhas')],
    },
    { id, now },
  );
}

function stubClient(responses: unknown[] = []) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  let index = 0;

  const send = vi.fn(
    (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      const response = responses[index] ?? {};
      index += 1;
      return Promise.resolve(response);
    },
  );

  return { client: { send } as unknown as DynamoDBDocumentClient, sent, send };
}

function buildHiddenPoint(id: string): CollectionPoint {
  const point = buildPoint(id);
  point.hide(now);
  return point;
}

function recordingWait() {
  const delays: number[] = [];

  return {
    delays,
    wait: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

function linkKey(id: string) {
  return { PK: 'CITY#LONDRINA', SK: `MATERIAL#pilhas#POINT#${id}` };
}

function materialLinks(ids: string[]) {
  return { Items: ids.map(linkKey) };
}

function pointKey(id: string) {
  return { PK: 'CITY#LONDRINA', SK: `POINT#${id}` };
}

function unprocessed(ids: string[]) {
  return { [TABLE]: { Keys: ids.map(pointKey) } };
}

function batchKeys(command: { input: Record<string, unknown> } | undefined): unknown[] {
  const requestItems = command?.input.RequestItems as
    Record<string, { Keys: unknown[] } | undefined> | undefined;
  return requestItems?.[TABLE]?.Keys ?? [];
}

function queries(sent: { name: string; input: Record<string, unknown> }[]) {
  return sent.filter((command) => command.name === 'QueryCommand');
}

describe('DynamoCollectionPointRepository', () => {
  it('writes the point, its material links and its uniqueness claim in one transaction', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.save(buildPoint('point-1'));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.name).toBe('TransactWriteCommand');
    const transactItems = sent[0]?.input.TransactItems as {
      Put: { Item: { SK: string }; ConditionExpression?: string };
    }[];
    expect(transactItems.map((entry) => entry.Put.Item.SK)).toEqual([
      'POINT#point-1',
      'MATERIAL#pilhas#POINT#point-1',
      'UNIQUE#POINT#ecoponto-point-1#6gge7u2',
    ]);
    // Only the claim is conditional: the point and its links must land with it.
    expect(transactItems.map((entry) => entry.Put.ConditionExpression)).toEqual([
      undefined,
      undefined,
      'attribute_not_exists(PK)',
    ]);
  });

  it('reads a point by its primary key', async () => {
    const { client, sent } = stubClient([{ Item: toItem(buildPoint('point-1')) }]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const point = await repository.findById('point-1');

    expect(point?.id).toBe('point-1');
    expect(sent[0]?.name).toBe('GetCommand');
    expect(sent[0]?.input.Key).toEqual({ PK: 'CITY#LONDRINA', SK: 'POINT#point-1' });
  });

  it('returns null when the point does not exist', async () => {
    const { client } = stubClient([{}]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('lists published points through the status index, newest first', async () => {
    const { client, sent } = stubClient([{ Items: [toItem(buildPoint('point-1'))] }]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.listPublished({ limit: 10 });

    expect(page.items).toHaveLength(1);
    expect(sent[0]?.name).toBe('QueryCommand');
    expect(sent[0]?.input.IndexName).toBe('GSI1-status');
    expect(sent[0]?.input.ScanIndexForward).toBe(false);
    expect(sent[0]?.input.ExpressionAttributeValues).toMatchObject({
      ':partition': 'STATUS#PUBLISHED',
    });
  });

  it('resolves a material search with a query on the auxiliary items plus a batch get', async () => {
    const { client, sent } = stubClient([
      { Items: [{ SK: 'MATERIAL#pilhas#POINT#point-1' }] },
      { Responses: { [TABLE]: [toItem(buildPoint('point-1'))] } },
    ]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 10 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1']);
    expect(sent.map((command) => command.name)).toEqual(['QueryCommand', 'BatchGetCommand']);
    expect(sent[0]?.input.ExpressionAttributeValues).toMatchObject({
      ':prefix': 'MATERIAL#pilhas#POINT#',
    });
  });

  it('does not issue a batch get when no point accepts the material', async () => {
    const { client, sent } = stubClient([{ Items: [] }]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.findByMaterialSlug('entulho', { limit: 10 });

    expect(page.items).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it('queries the geo index cell by cell and filters by real distance', async () => {
    const near = toItem(buildPoint('near', -23.3103, -51.1628));
    const far = toItem(buildPoint('far', -23.55, -51.4));

    const { client, sent } = stubClient(
      Array.from({ length: 9 }, (_, index) =>
        index === 0 ? { Items: [near, far] } : { Items: [] },
      ),
    );
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const points = await repository.findNearby({
      centre: Coordinates.create(-23.3103, -51.1628),
      radiusKm: 5,
      limit: 10,
    });

    expect(points.map((point) => point.id)).toEqual(['near']);
    expect(sent.every((command) => command.name === 'QueryCommand')).toBe(true);
    expect(sent.every((command) => command.input.IndexName === 'GSI2-geo')).toBe(true);
    expect(sent.length).toBeLessThanOrEqual(9);
  });

  it('never issues a Scan', async () => {
    const { client, sent } = stubClient([
      { Item: toItem(buildPoint('point-1')) },
      { Items: [] },
      { Items: [] },
    ]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.findById('point-1');
    await repository.listPublished({ limit: 10 });
    await repository.findByMaterialSlug('pilhas', { limit: 10 });

    expect(sent.some((command) => command.name.includes('Scan'))).toBe(false);
  });
});

describe('DynamoCollectionPointRepository batch get', () => {
  it('resends the keys DynamoDB left unprocessed on the first call', async () => {
    const { client, sent } = stubClient([
      materialLinks(['point-1', 'point-2']),
      {
        Responses: { [TABLE]: [toItem(buildPoint('point-1'))] },
        UnprocessedKeys: unprocessed(['point-2']),
      },
      { Responses: { [TABLE]: [toItem(buildPoint('point-2'))] } },
    ]);
    const { delays, wait } = recordingWait();
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger, wait);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 10 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1', 'point-2']);
    expect(sent.map((command) => command.name)).toEqual([
      'QueryCommand',
      'BatchGetCommand',
      'BatchGetCommand',
    ]);
    expect(batchKeys(sent[2])).toEqual([pointKey('point-2')]);
    expect(delays).toEqual([50]);
    expect(warnings).toEqual([]);
  });

  it('backs off exponentially and warns when the keys stay unprocessed', async () => {
    const stillPending = { UnprocessedKeys: unprocessed(['point-2']) };
    const { client, sent } = stubClient([
      materialLinks(['point-1', 'point-2']),
      {
        Responses: { [TABLE]: [toItem(buildPoint('point-1'))] },
        UnprocessedKeys: unprocessed(['point-2']),
      },
      stillPending,
      stillPending,
      stillPending,
      stillPending,
    ]);
    const { delays, wait } = recordingWait();
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger, wait);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 10 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1']);
    expect(sent.filter((command) => command.name === 'BatchGetCommand')).toHaveLength(5);
    expect(delays).toEqual([50, 100, 200, 400]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.context).toMatchObject({
      operation: 'DynamoCollectionPointRepository.batchGetPoints',
      table: TABLE,
      unprocessedKeys: 1,
    });
  });

  it('reads more than 100 ids in batches instead of dropping the excess', async () => {
    const ids = Array.from({ length: 120 }, (_, index) => `point-${index + 1}`);
    const items = ids.map((id) => toItem(buildPoint(id)));

    const { client, sent } = stubClient([
      materialLinks(ids),
      { Responses: { [TABLE]: items.slice(0, MAX_KEYS_PER_BATCH) } },
      { Responses: { [TABLE]: items.slice(MAX_KEYS_PER_BATCH) } },
    ]);
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 200 });

    expect(page.items.map((point) => point.id)).toEqual(ids);
    expect(sent.filter((command) => command.name === 'BatchGetCommand')).toHaveLength(2);
    expect(batchKeys(sent[1])).toHaveLength(MAX_KEYS_PER_BATCH);
    expect(batchKeys(sent[2])).toHaveLength(20);
    expect(warnings).toEqual([]);
  });

  it('retries each batch on its own when a later batch comes back partial', async () => {
    const ids = Array.from({ length: 120 }, (_, index) => `point-${index + 1}`);
    const items = ids.map((id) => toItem(buildPoint(id)));
    const lastId = 'point-120';

    const { client, sent } = stubClient([
      materialLinks(ids),
      { Responses: { [TABLE]: items.slice(0, MAX_KEYS_PER_BATCH) } },
      {
        Responses: { [TABLE]: items.slice(MAX_KEYS_PER_BATCH, 119) },
        UnprocessedKeys: unprocessed([lastId]),
      },
      { Responses: { [TABLE]: [toItem(buildPoint(lastId))] } },
    ]);
    const { delays, wait } = recordingWait();
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger, wait);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 200 });

    expect(page.items.map((point) => point.id)).toEqual(ids);
    expect(batchKeys(sent[3])).toEqual([pointKey(lastId)]);
    expect(delays).toEqual([50]);
    expect(warnings).toEqual([]);
  });
});

describe('DynamoCollectionPointRepository material pagination', () => {
  function cursorOf(page: { nextCursor: string | null }) {
    return decodeCursor(page.nextCursor ?? undefined);
  }

  it('fills the page with as many published points as the limit asks for', async () => {
    const { client, sent } = stubClient([
      { ...materialLinks(['point-1', 'point-2']), LastEvaluatedKey: linkKey('point-2') },
      { Responses: { [TABLE]: [toItem(buildPoint('point-1')), toItem(buildPoint('point-2'))] } },
    ]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 2 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1', 'point-2']);
    expect(cursorOf(page)).toEqual(linkKey('point-2'));
    expect(queries(sent)).toHaveLength(1);
  });

  it('keeps reading links so hidden points in the middle do not shrink the page', async () => {
    const { client, sent } = stubClient([
      { ...materialLinks(['point-1', 'point-2', 'point-3']), LastEvaluatedKey: linkKey('point-3') },
      {
        Responses: {
          [TABLE]: [
            toItem(buildPoint('point-1')),
            toItem(buildHiddenPoint('point-2')),
            toItem(buildPoint('point-3')),
          ],
        },
      },
      materialLinks(['point-4', 'point-5']),
      {
        Responses: {
          [TABLE]: [toItem(buildHiddenPoint('point-4')), toItem(buildPoint('point-5'))],
        },
      },
    ]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 3 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1', 'point-3', 'point-5']);
    expect(queries(sent)).toHaveLength(2);
    expect(queries(sent)[1]?.input.ExclusiveStartKey).toEqual(linkKey('point-3'));
  });

  it('ends with a null cursor once the material partition runs out', async () => {
    const { client } = stubClient([
      materialLinks(['point-1', 'point-2']),
      { Responses: { [TABLE]: [toItem(buildPoint('point-1')), toItem(buildPoint('point-2'))] } },
    ]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 5 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1', 'point-2']);
    expect(page.nextCursor).toBeNull();
  });

  it('reports a null cursor when the limit is filled by the last link of the partition', async () => {
    const { client } = stubClient([
      materialLinks(['point-1', 'point-2']),
      { Responses: { [TABLE]: [toItem(buildPoint('point-1')), toItem(buildPoint('point-2'))] } },
    ]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('returns a short last page when the remaining links point at hidden points', async () => {
    const { client } = stubClient([
      materialLinks(['point-1', 'point-2', 'point-3']),
      {
        Responses: {
          [TABLE]: [
            toItem(buildPoint('point-1')),
            toItem(buildHiddenPoint('point-2')),
            toItem(buildHiddenPoint('point-3')),
          ],
        },
      },
    ]);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 3 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1']);
    expect(page.nextCursor).toBeNull();
  });

  it('resumes the next page from the link it stopped on, without repeating or skipping', async () => {
    const published = ['point-1', 'point-3', 'point-4', 'point-5', 'point-6'];
    const items = new Map([
      ...published.map((id) => [id, toItem(buildPoint(id))] as const),
      ['point-2', toItem(buildHiddenPoint('point-2'))] as const,
    ]);
    const responseFor = (ids: string[]) => ({
      Responses: { [TABLE]: ids.map((id) => items.get(id)) },
    });

    // Page one stops part way through its second batch of links: it needed only
    // one more point, but DynamoDB handed it three.
    const first = stubClient([
      { ...materialLinks(['point-1', 'point-2', 'point-3']), LastEvaluatedKey: linkKey('point-3') },
      responseFor(['point-1', 'point-2', 'point-3']),
      { ...materialLinks(['point-4', 'point-5', 'point-6']), LastEvaluatedKey: linkKey('point-6') },
      responseFor(['point-4', 'point-5', 'point-6']),
    ]);
    const repository = new DynamoCollectionPointRepository(first.client, TABLE, silentLogger);

    const pageOne = await repository.findByMaterialSlug('pilhas', { limit: 3 });

    expect(pageOne.items.map((point) => point.id)).toEqual(['point-1', 'point-3', 'point-4']);
    // The cursor is the link consumed last, not the end of the page that was read.
    expect(cursorOf(pageOne)).toEqual(linkKey('point-4'));

    const second = stubClient([
      materialLinks(['point-5', 'point-6']),
      responseFor(['point-5', 'point-6']),
    ]);
    const continued = new DynamoCollectionPointRepository(second.client, TABLE, silentLogger);

    const pageTwo = await continued.findByMaterialSlug('pilhas', {
      limit: 3,
      cursor: pageOne.nextCursor ?? undefined,
    });

    expect(queries(second.sent)[0]?.input.ExclusiveStartKey).toEqual(linkKey('point-4'));
    expect(pageTwo.items.map((point) => point.id)).toEqual(['point-5', 'point-6']);
    expect(pageTwo.nextCursor).toBeNull();

    const seen = [...pageOne.items, ...pageTwo.items].map((point) => point.id);
    expect(seen).toEqual(published);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('gives up at the page cap on a partition of hidden points and warns', async () => {
    const hiddenPage = (first: string, second: string) => [
      { ...materialLinks([first, second]), LastEvaluatedKey: linkKey(second) },
      {
        Responses: {
          [TABLE]: [toItem(buildHiddenPoint(first)), toItem(buildHiddenPoint(second))],
        },
      },
    ];

    const { client, sent } = stubClient(
      Array.from({ length: 6 }, (_, page) =>
        hiddenPage('point-' + String(page * 2 + 1), 'point-' + String(page * 2 + 2)),
      ).flat(),
    );
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 2 });

    expect(page.items).toEqual([]);
    expect(queries(sent)).toHaveLength(5);
    // The cursor still moves forward, so calling again makes progress.
    expect(cursorOf(page)).toEqual(linkKey('point-10'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.context).toMatchObject({
      operation: 'DynamoCollectionPointRepository.findByMaterialSlug',
      materialSlug: 'pilhas',
      limit: 2,
      collected: 0,
      pagesRead: 5,
    });
  });
});

describe('DynamoCollectionPointRepository nearby paging', () => {
  const centre = Coordinates.create(-23.3103, -51.1628);

  function geoPartitionOf(latitude: number, longitude: number) {
    return keys.geoPartition(encodeGeohash(latitude, longitude, GEOHASH_PARTITION_PRECISION));
  }

  /**
   * Routes by the partition asked for and by how many times it was asked, so the
   * test does not depend on the order the cells happen to be queried in.
   */
  function pagingClient(pagesByPartition: Map<string, unknown[]>) {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const served = new Map<string, number>();

    const send = vi.fn(
      (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });

        const values = command.input.ExpressionAttributeValues as
          Record<string, string> | undefined;
        const partition = values?.[':partition'] ?? '';
        const index = served.get(partition) ?? 0;
        served.set(partition, index + 1);

        return Promise.resolve(pagesByPartition.get(partition)?.[index] ?? { Items: [] });
      },
    );

    return { client: { send } as unknown as DynamoDBDocumentClient, sent };
  }

  function queriesFor(
    sent: { input: Record<string, unknown> }[],
    partition: string,
  ): { input: Record<string, unknown> }[] {
    return sent.filter((command) => {
      const values = command.input.ExpressionAttributeValues as Record<string, string> | undefined;
      return values?.[':partition'] === partition;
    });
  }

  it('follows LastEvaluatedKey so a point on the second page still ranks', async () => {
    const partition = geoPartitionOf(centre.latitude, centre.longitude);
    const cursor = { GSI2PK: partition, GSI2SK: 'POINT#middling' };

    // The nearest point is only reachable through the cursor: a single page
    // would have ranked the middling one first and lost the other entirely.
    const middling = buildPoint('middling', -23.34, -51.19);
    const nearest = buildPoint('nearest', -23.3105, -51.163);

    const { client, sent } = pagingClient(
      new Map([
        [
          partition,
          [{ Items: [toItem(middling)], LastEvaluatedKey: cursor }, { Items: [toItem(nearest)] }],
        ],
      ]),
    );
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const points = await repository.findNearby({ centre, radiusKm: 5, limit: 10 });

    expect(points.map((point) => point.id)).toEqual(['nearest', 'middling']);

    const cellQueries = queriesFor(sent, partition);
    expect(cellQueries).toHaveLength(2);
    expect(cellQueries[0]?.input.ExclusiveStartKey).toBeUndefined();
    expect(cellQueries[1]?.input.ExclusiveStartKey).toEqual(cursor);
  });

  it('drains a cell across several pages before ranking', async () => {
    const partition = geoPartitionOf(centre.latitude, centre.longitude);
    const ids = ['third', 'second', 'first'];

    // One point per page, planted from farthest to nearest.
    const pages = ids.map((id, index) => ({
      Items: [toItem(buildPoint(id, -23.3103 - (ids.length - index) * 0.005, -51.1628))],
      ...(index < ids.length - 1
        ? { LastEvaluatedKey: { GSI2PK: partition, GSI2SK: `POINT#${id}` } }
        : {}),
    }));

    const { client, sent } = pagingClient(new Map([[partition, pages]]));
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const points = await repository.findNearby({ centre, radiusKm: 5, limit: 10 });

    expect(points.map((point) => point.id)).toEqual(['first', 'second', 'third']);
    expect(queriesFor(sent, partition)).toHaveLength(3);
  });

  it('still honours the limit after reading every page', async () => {
    const partition = geoPartitionOf(centre.latitude, centre.longitude);

    const { client } = pagingClient(
      new Map([
        [
          partition,
          [
            {
              Items: [toItem(buildPoint('far', -23.33, -51.1628))],
              LastEvaluatedKey: { GSI2PK: partition, GSI2SK: 'POINT#far' },
            },
            { Items: [toItem(buildPoint('close', -23.3113, -51.1628))] },
          ],
        ],
      ]),
    );
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const points = await repository.findNearby({ centre, radiusKm: 5, limit: 1 });

    expect(points.map((point) => point.id)).toEqual(['close']);
  });

  it('stops at the page cap on an endless cell and warns with the cell and page count', async () => {
    const partition = geoPartitionOf(centre.latitude, centre.longitude);

    // Every page promises another, so only the cap ends the loop.
    const pages = Array.from({ length: 20 }, (_, index) => ({
      Items: [toItem(buildPoint(`point-${index}`, -23.3105, -51.163))],
      LastEvaluatedKey: { GSI2PK: partition, GSI2SK: `POINT#point-${index}` },
    }));

    const { client, sent } = pagingClient(new Map([[partition, pages]]));
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger);

    const points = await repository.findNearby({ centre, radiusKm: 5, limit: 50 });

    expect(queriesFor(sent, partition)).toHaveLength(10);
    expect(points).toHaveLength(10);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.context).toMatchObject({
      operation: 'DynamoCollectionPointRepository.findNearby',
      cell: encodeGeohash(centre.latitude, centre.longitude, GEOHASH_PARTITION_PRECISION),
      pagesRead: 10,
    });
  });

  it('does not warn for a cell that ends exactly on its last page', async () => {
    const partition = geoPartitionOf(centre.latitude, centre.longitude);

    const pages = Array.from({ length: 10 }, (_, index) => ({
      Items: [toItem(buildPoint(`point-${index}`, -23.3105, -51.163))],
      ...(index < 9 ? { LastEvaluatedKey: { GSI2PK: partition, GSI2SK: `POINT#${index}` } } : {}),
    }));

    const { client, sent } = pagingClient(new Map([[partition, pages]]));
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger);

    await repository.findNearby({ centre, radiusKm: 5, limit: 50 });

    expect(queriesFor(sent, partition)).toHaveLength(10);
    expect(warnings).toEqual([]);
  });
});

describe('DynamoCollectionPointRepository duplicate claims', () => {
  /** Shaped like the SDK error: name plus one cancellation reason per item. */
  function transactionCancelled(codes: (string | undefined)[]): Error {
    const error = new Error('Transaction cancelled, please refer cancellation reasons');
    error.name = 'TransactionCanceledException';
    return Object.assign(error, {
      CancellationReasons: codes.map((Code) => (Code === undefined ? {} : { Code })),
    });
  }

  function rejectingClient(error: Error) {
    const send = vi.fn(() => Promise.reject(error));
    return { client: { send } as unknown as DynamoDBDocumentClient, send };
  }

  it('turns the losing concurrent write into a conflict the person can read', async () => {
    const { client } = rejectingClient(
      transactionCancelled(['None', 'None', 'ConditionalCheckFailed']),
    );
    const { logger, warnings } = createRecordingLogger();
    const repository = new DynamoCollectionPointRepository(client, TABLE, logger);

    const failure = repository.save(buildPoint('point-2'));

    await expect(failure).rejects.toBeInstanceOf(ConflictError);
    await expect(failure).rejects.toThrow('Esse ponto de coleta já está cadastrado.');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toBe('collection_point.save.conflict');
    expect(warnings[0]?.context).toMatchObject({
      nameSlug: 'ecoponto-point-2',
      geohashCell: '6gge7u2',
    });
  });

  it('keeps the CONFLICT code so the route answers 409', async () => {
    const { client } = rejectingClient(transactionCancelled(['ConditionalCheckFailed']));
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await expect(repository.save(buildPoint('point-1'))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('lets a cancellation for any other reason through untouched', async () => {
    const throughput = transactionCancelled(['ProvisionedThroughputExceeded']);
    const { client } = rejectingClient(throughput);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    const failure = repository.save(buildPoint('point-1'));

    await expect(failure).rejects.toBe(throughput);
    await expect(failure).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('does not mistake an unrelated failure for a duplicate', async () => {
    const network = new Error('socket hang up');
    const { client } = rejectingClient(network);
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await expect(repository.save(buildPoint('point-1'))).rejects.toBe(network);
  });

  it('claims the same key for two points registered under the same name and place', async () => {
    const first = stubClient();
    const second = stubClient();

    await new DynamoCollectionPointRepository(first.client, TABLE, silentLogger).save(
      CollectionPoint.create(
        {
          name: 'Ecoponto Centro',
          address: Address.create('Rua Pará, 500'),
          coordinates: Coordinates.create(-23.3103, -51.1628),
          materials: [Material.create('Pilhas')],
        },
        { id: 'first', now },
      ),
    );

    // Same name, 20 m away, and a different id: still the same claim.
    await new DynamoCollectionPointRepository(second.client, TABLE, silentLogger).save(
      CollectionPoint.create(
        {
          name: 'ECOPONTO  Centro!',
          address: Address.create('Rua Pará, 510'),
          coordinates: Coordinates.create(-23.31048, -51.1628),
          materials: [Material.create('Pilhas')],
        },
        { id: 'second', now },
      ),
    );

    expect(claimKeyOf(first.sent[0])).toBe(claimKeyOf(second.sent[0]));
  });
});

function claimKeyOf(command: { input: Record<string, unknown> } | undefined): string {
  const items = command?.input.TransactItems as { Put: { Item: { SK: string } } }[] | undefined;
  return (
    (items ?? []).map((entry) => entry.Put.Item.SK).find((sk) => sk.startsWith('UNIQUE#')) ?? ''
  );
}

describe('DynamoCollectionPointRepository update', () => {
  function putsOf(command: { input: Record<string, unknown> } | undefined) {
    return (command?.input.TransactItems ?? []) as {
      Put: { Item: Record<string, unknown>; ConditionExpression?: string };
    }[];
  }

  function hiddenPoint(id: string): CollectionPoint {
    const point = buildPoint(id);
    point.hide(now);
    return point;
  }

  it('rewrites the point and its material links in one transaction', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.update(buildPoint('point-1'));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.name).toBe('TransactWriteCommand');
    expect(putsOf(sent[0]).map((entry) => entry.Put.Item.SK)).toEqual([
      'POINT#point-1',
      'MATERIAL#pilhas#POINT#point-1',
    ]);
  });

  it('refuses to create a point that is not there', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.update(buildPoint('point-1'));

    expect(putsOf(sent[0])[0]?.Put.ConditionExpression).toBe('attribute_exists(PK)');
  });

  it('leaves the uniqueness claim untouched, since the point already holds it', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.update(buildPoint('point-1'));

    const keys = putsOf(sent[0]).map((entry) => String(entry.Put.Item.SK));
    expect(keys.some((key) => key.startsWith('UNIQUE#'))).toBe(false);
  });

  it('strips the geo index attributes when the point is hidden', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.update(hiddenPoint('point-1'));

    const item = putsOf(sent[0])[0]?.Put.Item;
    expect(item?.status).toBe('HIDDEN');
    expect(item).not.toHaveProperty('GSI2PK');
    expect(item).not.toHaveProperty('GSI2SK');
    // The status index still carries it, so an administrator can list it.
    expect(item?.GSI1PK).toBe('STATUS#HIDDEN');
  });

  it('restores the geo index attributes when the point is published again', async () => {
    const point = hiddenPoint('point-1');
    point.publish(now);

    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.update(point);

    const item = putsOf(sent[0])[0]?.Put.Item;
    expect(item?.status).toBe('PUBLISHED');
    expect(item?.GSI2PK).toBe('GEO#6gge');
    expect(item?.GSI2SK).toBe('POINT#point-1');
    expect(item?.GSI1PK).toBe('STATUS#PUBLISHED');
  });

  it('keeps the material links intact across a hide', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.update(hiddenPoint('point-1'));

    const link = putsOf(sent[0])[1]?.Put.Item;
    expect(link?.SK).toBe('MATERIAL#pilhas#POINT#point-1');
    expect(link?.pointId).toBe('point-1');
  });

  it('lets a failure through instead of reading it as a duplicate', async () => {
    const boom = new Error('socket hang up');
    const send = vi.fn(() => Promise.reject(boom));
    const repository = new DynamoCollectionPointRepository(
      { send } as unknown as DynamoDBDocumentClient,
      TABLE,
      silentLogger,
    );

    await expect(repository.update(buildPoint('point-1'))).rejects.toBe(boom);
  });
});
