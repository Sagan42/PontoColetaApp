import type { Clock } from '../../../../shared/application/ports/index.js';
import { NotFoundError } from '../../../../shared/domain/errors/index.js';
import type { CollectionPointSnapshot } from '../../domain/collection-point.js';
import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';

/**
 * Puts a point back on the air. It has to read past the public visibility rule:
 * the point it is about to publish is, by definition, hidden.
 */
export class PublishCollectionPoint {
  constructor(
    private readonly repository: CollectionPointRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<CollectionPointSnapshot> {
    const point = await this.repository.findById(id);
    if (!point) {
      throw new NotFoundError('Ponto de coleta não encontrado.');
    }

    point.publish(this.clock.now());
    await this.repository.update(point);

    return point.toSnapshot();
  }
}
