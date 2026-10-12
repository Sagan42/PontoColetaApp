import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { DynamoCollectionPointRepository } from '../../src/modules/collection-points/infrastructure/dynamodb/dynamo-collection-point-repository.js';
import { toItem } from '../../src/modules/collection-points/infrastructure/dynamodb/collection-point-item.js';
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

describe('DynamoCollectionPointRepository', () => {
  it('writes the point and its material links in one transaction', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoCollectionPointRepository(client, TABLE, silentLogger);

    await repository.save(buildPoint('point-1'));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.name).toBe('TransactWriteCommand');
    const transactItems = sent[0]?.input.TransactItems as { Put: { Item: { SK: string } } }[];
    expect(transactItems.map((entry) => entry.Put.Item.SK)).toEqual([
      'POINT#point-1',
      'MATERIAL#pilhas#POINT#point-1',
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

  function materialLinks(ids: string[]) {
    return { Items: ids.map((id) => ({ SK: `MATERIAL#pilhas#POINT#${id}` })) };
  }

  function pointKey(id: string) {
    return { PK: 'CITY#LONDRINA', SK: `POINT#${id}` };
  }

  function unprocessed(ids: string[]) {
    return { [TABLE]: { Keys: ids.map(pointKey) } };
  }

  function batchKeys(command: { input: Record<string, unknown> } | undefined): unknown[] {
    const requestItems = command?.input.RequestItems as
      | Record<string, { Keys: unknown[] } | undefined>
      | undefined;
    return requestItems?.[TABLE]?.Keys ?? [];
  }

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
