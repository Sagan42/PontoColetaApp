import type { Clock, IdGenerator } from '../../../../shared/application/ports/index.js';
import { Feedback } from '../../domain/feedback.js';
import type { FeedbackRepository } from '../../domain/repositories/feedback-repository.js';

export interface SubmitFeedbackInput {
  readonly author?: string | null | undefined;
  readonly message: string;
}

export interface SubmitFeedbackResult {
  readonly id: string;
  readonly submittedAt: string;
}

export class SubmitFeedback {
  constructor(
    private readonly repository: FeedbackRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
    // A data é do servidor, nunca do cliente: data de feedback é registro, e
    // registro que o remetente escolhe não registra nada.
    const feedback = Feedback.create({
      id: this.idGenerator.generate(),
      author: input.author,
      message: input.message,
      submittedAt: this.clock.now(),
    });

    await this.repository.save(feedback);

    return { id: feedback.id, submittedAt: feedback.submittedAt.toISOString() };
  }
}
