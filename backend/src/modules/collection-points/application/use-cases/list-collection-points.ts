import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';
import type { CollectionPointResult } from '../dtos/collection-point-result.js';

export interface ListCollectionPointsInput {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface ListCollectionPointsOutput {
  readonly items: CollectionPointResult[];
  readonly nextCursor: string | null;
}

export class ListCollectionPoints {
  constructor(private readonly repository: CollectionPointRepository) {}

  async execute(input: ListCollectionPointsInput): Promise<ListCollectionPointsOutput> {
    const page = await this.repository.listPublished({
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      items: page.items.map((point) => ({ point: point.toSnapshot(), distanceKm: null })),
      nextCursor: page.nextCursor,
    };
  }
}
