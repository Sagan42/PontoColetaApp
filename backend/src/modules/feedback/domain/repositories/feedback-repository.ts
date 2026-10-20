import type {
  MonthlyPage,
  MonthlyPageRequest,
} from '../../../../shared/infrastructure/dynamodb/monthly-reader.js';
import type { Feedback } from '../feedback.js';

export type FeedbackPageRequest = MonthlyPageRequest;
export type FeedbackPage = MonthlyPage<Feedback>;

export interface FeedbackRepository {
  save(feedback: Feedback): Promise<void>;

  /** Mais recente primeiro. */
  findRecent(request: FeedbackPageRequest): Promise<FeedbackPage>;
}
