import type { Logger } from '../../../../shared/application/ports/index.js';
import { UsageMetricType } from '../../../metrics/domain/index.js';
import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';
import { Material } from '../../domain/value-objects/material.js';
import type { CollectionPointResult } from '../dtos/collection-point-result.js';
import type { UsageMetricRecorder } from '../ports/usage-metric-recorder.js';

export interface SearchByMaterialInput {
  readonly material: string;
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface SearchByMaterialOutput {
  readonly material: { query: string; slug: string };
  readonly items: CollectionPointResult[];
  readonly nextCursor: string | null;
}

export class SearchCollectionPointsByMaterial {
  constructor(
    private readonly repository: CollectionPointRepository,
    private readonly metrics: UsageMetricRecorder,
    private readonly logger: Logger,
  ) {}

  async execute(input: SearchByMaterialInput): Promise<SearchByMaterialOutput> {
    const material = Material.create(input.material);

    const page = await this.repository.findByMaterialSlug(material.slug, {
      limit: input.limit,
      cursor: input.cursor,
    });

    await this.recordMetric();

    return {
      material: { query: material.label, slug: material.slug },
      items: page.items.map((point) => ({ point: point.toSnapshot(), distanceKm: null })),
      nextCursor: page.nextCursor,
    };
  }

  private async recordMetric(): Promise<void> {
    try {
      await this.metrics.record(UsageMetricType.SearchByMaterial);
    } catch (error) {
      this.logger.warn('metrics.record.failed', {
        operation: 'SearchCollectionPointsByMaterial',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}
