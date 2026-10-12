import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/shared/domain/errors/index.js';
import { GetCollectionPoint } from '../../src/modules/collection-points/application/use-cases/get-collection-point.js';
import { HideCollectionPoint } from '../../src/modules/collection-points/application/use-cases/hide-collection-point.js';
import { PublishCollectionPoint } from '../../src/modules/collection-points/application/use-cases/publish-collection-point.js';
import { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { FixedClock, InMemoryCollectionPointRepository } from '../support/fakes.js';

const createdAt = new Date('2026-08-22T12:00:00.000Z');
const moderatedAt = new Date('2026-10-12T09:30:00.000Z');

function buildPoint(id: string): CollectionPoint {
  return CollectionPoint.create(
    {
      name: 'Ecoponto Centro',
      address: Address.create('Rua Pará, 500'),
      coordinates: Coordinates.create(-23.3103, -51.1628),
      materials: [Material.create('Pilhas')],
    },
    { id, now: createdAt },
  );
}

describe('collection point lifecycle', () => {
  let repository: InMemoryCollectionPointRepository;
  let hide: HideCollectionPoint;
  let publish: PublishCollectionPoint;
  let read: GetCollectionPoint;

  beforeEach(async () => {
    repository = new InMemoryCollectionPointRepository();
    const clock = new FixedClock(moderatedAt);

    hide = new HideCollectionPoint(repository, clock);
    publish = new PublishCollectionPoint(repository, clock);
    read = new GetCollectionPoint(repository);

    await repository.save(buildPoint('point-1'));
  });

  it('takes a published point off the air', async () => {
    const snapshot = await hide.execute('point-1');

    expect(snapshot.status).toBe('HIDDEN');
    expect(snapshot.updatedAt).toBe(moderatedAt.toISOString());
    expect(repository.updated).toEqual(['point-1']);
  });

  it('stops serving a hidden point to the public', async () => {
    await expect(read.execute('point-1')).resolves.toMatchObject({ id: 'point-1' });

    await hide.execute('point-1');

    await expect(read.execute('point-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('drops a hidden point out of the public searches', async () => {
    await hide.execute('point-1');

    const byMaterial = await repository.findByMaterialSlug('pilhas', { limit: 10 });
    const nearby = await repository.findNearby({
      centre: Coordinates.create(-23.3103, -51.1628),
      radiusKm: 5,
      limit: 10,
    });

    expect(byMaterial.items).toEqual([]);
    expect(nearby).toEqual([]);
  });

  it('puts a hidden point back on the air', async () => {
    await hide.execute('point-1');

    const snapshot = await publish.execute('point-1');

    expect(snapshot.status).toBe('PUBLISHED');
    await expect(read.execute('point-1')).resolves.toMatchObject({ id: 'point-1' });
  });

  it('reaches a hidden point, which the public read cannot', async () => {
    await hide.execute('point-1');

    // The point publish is about to restore is, by definition, invisible.
    await expect(read.execute('point-1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(publish.execute('point-1')).resolves.toMatchObject({ status: 'PUBLISHED' });
  });

  it('hides an already hidden point without complaining', async () => {
    await hide.execute('point-1');

    await expect(hide.execute('point-1')).resolves.toMatchObject({ status: 'HIDDEN' });
  });

  it('publishes an already published point without complaining', async () => {
    await expect(publish.execute('point-1')).resolves.toMatchObject({ status: 'PUBLISHED' });
  });

  it('leaves updatedAt alone when hiding changes nothing', async () => {
    await hide.execute('point-1');
    const first = await repository.findById('point-1');

    await hide.execute('point-1');
    const second = await repository.findById('point-1');

    expect(second?.toSnapshot().updatedAt).toBe(first?.toSnapshot().updatedAt);
  });

  it('reports an unknown point as not found, for both directions', async () => {
    await expect(hide.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(publish.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.updated).toEqual([]);
  });

  it('keeps the materials through a hide and publish round trip', async () => {
    await hide.execute('point-1');
    const snapshot = await publish.execute('point-1');

    expect(snapshot.materials.map((material) => material.slug)).toEqual(['pilhas']);
  });
});
