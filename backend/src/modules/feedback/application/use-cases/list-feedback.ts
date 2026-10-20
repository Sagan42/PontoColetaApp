import type { Clock } from '../../../../shared/application/ports/index.js';
import type { FeedbackSnapshot } from '../../domain/feedback.js';
import type { FeedbackRepository } from '../../domain/repositories/feedback-repository.js';

export interface ListFeedbackInput {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface ListFeedbackOutput {
  readonly items: FeedbackSnapshot[];
  readonly nextCursor: string | null;
}

export class ListFeedback {
  constructor(
    private readonly repository: FeedbackRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ListFeedbackInput): Promise<ListFeedbackOutput> {
    // O mês de hoje é o ponto de partida da leitura; o repositório caminha para
    // trás a partir dele.
    const latestMonth = this.clock.now().toISOString().slice(0, 7);

    const page = await this.repository.findRecent({
      limit: input.limit,
      cursor: input.cursor,
      latestMonth,
    });

    return {
      items: page.items.map((feedback) => feedback.toSnapshot()),
      nextCursor: page.nextCursor,
    };
  }
}
