import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { DynamoCollectionPointRepository } from '../../src/modules/collection-points/infrastructure/dynamodb/dynamo-collection-point-repository.js';
import { toItem } from '../../src/modules/collection-points/infrastructure/dynamodb/collection-point-item.js';

const TABLE = 'pontocoleta-test';
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
    const repository = new DynamoCollectionPointRepository(client, TABLE);

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
    const repository = new DynamoCollectionPointRepository(client, TABLE);

    const point = await repository.findById('point-1');

    expect(point?.id).toBe('point-1');
    expect(sent[0]?.name).toBe('GetCommand');
    expect(sent[0]?.input.Key).toEqual({ PK: 'CITY#LONDRINA', SK: 'POINT#point-1' });
  });

  it('returns null when the point does not exist', async () => {
    const { client } = stubClient([{}]);
    const repository = new DynamoCollectionPointRepository(client, TABLE);

    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('lists published points through the status index, newest first', async () => {
    const { client, sent } = stubClient([{ Items: [toItem(buildPoint('point-1'))] }]);
    const repository = new DynamoCollectionPointRepository(client, TABLE);

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
    const repository = new DynamoCollectionPointRepository(client, TABLE);

    const page = await repository.findByMaterialSlug('pilhas', { limit: 10 });

    expect(page.items.map((point) => point.id)).toEqual(['point-1']);
    expect(sent.map((command) => command.name)).toEqual(['QueryCommand', 'BatchGetCommand']);
    expect(sent[0]?.input.ExpressionAttributeValues).toMatchObject({
      ':prefix': 'MATERIAL#pilhas#POINT#',
    });
  });

  it('does not issue a batch get when no point accepts the material', async () => {
    const { client, sent } = stubClient([{ Items: [] }]);
    const repository = new DynamoCollectionPointRepository(client, TABLE);

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
    const repository = new DynamoCollectionPointRepository(client, TABLE);

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
    const repository = new DynamoCollectionPointRepository(client, TABLE);

    await repository.findById('point-1');
    await repository.listPublished({ limit: 10 });
    await repository.findByMaterialSlug('pilhas', { limit: 10 });

    expect(sent.some((command) => command.name.includes('Scan'))).toBe(false);
  });
});
