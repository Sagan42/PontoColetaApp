import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { readMonthlyPartitions } from '../../../../shared/infrastructure/dynamodb/monthly-reader.js';
import { Feedback } from '../../domain/feedback.js';
import type {
  FeedbackPage,
  FeedbackPageRequest,
  FeedbackRepository,
} from '../../domain/repositories/feedback-repository.js';

export const FEEDBACK_ENTITY_TYPE = 'Feedback';

/**
 * Mora na mesma tabela única — zero infraestrutura nova. A partição é o mês,
 * como nas métricas, para que a quantidade de itens por partição não cresça
 * para sempre. A chave de ordenação começa pelo instante, então ler um mês já
 * sai em ordem cronológica.
 *
 * Nenhum atributo de GSI é gravado: os dois índices são esparsos, logo o
 * feedback não entra em nenhum deles e não custa escrita de índice.
 */
export const feedbackKeys = {
  monthPartition: (submittedAt: Date): string =>
    `FEEDBACK#${submittedAt.toISOString().slice(0, 7)}`,
  monthPartitionFromMonth: (month: string): string => `FEEDBACK#${month}`,
  sortKey: (submittedAt: Date, id: string): string => `AT#${submittedAt.toISOString()}#${id}`,
} as const;

export function toFeedback(raw: Record<string, unknown>): Feedback {
  return Feedback.restore({
    id: typeof raw.feedbackId === 'string' ? raw.feedbackId : '',
    author: typeof raw.author === 'string' ? raw.author : '',
    message: typeof raw.message === 'string' ? raw.message : '',
    submittedAt: typeof raw.submittedAt === 'string' ? raw.submittedAt : '',
  });
}

export class DynamoFeedbackRepository implements FeedbackRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async save(feedback: Feedback): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: feedbackKeys.monthPartition(feedback.submittedAt),
          SK: feedbackKeys.sortKey(feedback.submittedAt, feedback.id),
          entityType: FEEDBACK_ENTITY_TYPE,
          feedbackId: feedback.id,
          author: feedback.author,
          message: feedback.message,
          submittedAt: feedback.submittedAt.toISOString(),
        },
        // O id é um UUID, então a colisão é teórica. A condição está aqui para
        // que, se um dia for, a escrita falhe em vez de sobrescrever silenciosamente.
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }

  findRecent(request: FeedbackPageRequest): Promise<FeedbackPage> {
    return readMonthlyPartitions({
      client: this.client,
      tableName: this.tableName,
      partitionFor: feedbackKeys.monthPartitionFromMonth,
      toDomain: toFeedback,
      request,
    });
  }
}
