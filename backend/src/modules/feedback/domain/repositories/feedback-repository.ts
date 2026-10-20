import type { Feedback } from '../feedback.js';

export interface FeedbackPageRequest {
  readonly limit: number;
  readonly cursor?: string | undefined;
  /** Mês mais recente a consultar, `AAAA-MM`. A leitura caminha para trás dele. */
  readonly latestMonth: string;
}

export interface FeedbackPage {
  readonly items: Feedback[];

  /**
   * Chave opaca para retomar, ou `null` quando a janela de leitura terminou.
   * Como nas outras listagens, um cursor não promete haver mais itens: promete
   * apenas que a fonte não era sabidamente o fim.
   */
  readonly nextCursor: string | null;
}

export interface FeedbackRepository {
  save(feedback: Feedback): Promise<void>;

  /** Mais recente primeiro. */
  findRecent(request: FeedbackPageRequest): Promise<FeedbackPage>;
}
