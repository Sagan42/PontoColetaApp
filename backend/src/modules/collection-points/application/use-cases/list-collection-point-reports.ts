import type { Clock } from '../../../../shared/application/ports/index.js';
import type { CollectionPointReportSnapshot } from '../../domain/collection-point-report.js';
import type { CollectionPointReportRepository } from '../../domain/repositories/collection-point-report-repository.js';

export interface ListCollectionPointReportsInput {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface ListCollectionPointReportsOutput {
  readonly items: CollectionPointReportSnapshot[];
  readonly nextCursor: string | null;
}

export class ListCollectionPointReports {
  constructor(
    private readonly repository: CollectionPointReportRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ListCollectionPointReportsInput,
  ): Promise<ListCollectionPointReportsOutput> {
    // O mês de hoje é o ponto de partida; o repositório caminha para trás.
    const latestMonth = this.clock.now().toISOString().slice(0, 7);

    const page = await this.repository.findRecent({
      limit: input.limit,
      cursor: input.cursor,
      latestMonth,
    });

    return {
      items: page.items.map((report) => report.toSnapshot()),
      nextCursor: page.nextCursor,
    };
  }
}
