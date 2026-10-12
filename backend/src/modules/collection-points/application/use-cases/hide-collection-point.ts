import type { Clock } from '../../../../shared/application/ports/index.js';
import { NotFoundError } from '../../../../shared/domain/errors/index.js';
import type { CollectionPointSnapshot } from '../../domain/collection-point.js';
import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';

/**
 * Takes a point off the air. Unlike the public read, it finds a point whatever
 * its status, so hiding an already hidden point is a no-op rather than a 404.
 */
export class HideCollectionPoint {
  constructor(
    private readonly repository: CollectionPointRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<CollectionPointSnapshot> {
    const point = await this.repository.findById(id);
    if (!point) {
      throw new NotFoundError('Ponto de coleta não encontrado.');
    }

    point.hide(this.clock.now());
    await this.repository.update(point);

    return point.toSnapshot();
  }
}
