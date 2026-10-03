import { NotFoundError } from '../../../../shared/domain/errors/index.js';
import type { CollectionPointSnapshot } from '../../domain/collection-point.js';
import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';

export class GetCollectionPoint {
  constructor(private readonly repository: CollectionPointRepository) {}

  async execute(id: string): Promise<CollectionPointSnapshot> {
    const point = await this.repository.findById(id);

    if (!point || !point.isPubliclyVisible) {
      throw new NotFoundError('Ponto de coleta não encontrado.');
    }

    return point.toSnapshot();
  }
}
