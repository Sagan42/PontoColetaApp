import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  decodeCursor,
  encodeCursor,
  type DynamoKey,
} from '../../../../shared/infrastructure/dynamodb/pagination.js';
import { Feedback } from '../../domain/feedback.js';
import type {
  FeedbackPage,
  FeedbackPageRequest,
  FeedbackRepository,
} from '../../domain/repositories/feedback-repository.js';

export const FEEDBACK_ENTITY_TYPE = 'Feedback';

/**
 * Quantos meses uma única leitura caminha para trás antes de parar.
 *
 * A partição é o mês, e o passado não tem fim: sem um teto, uma listagem de
 * meses vazios consultaria partições para sempre. Doze meses cobrem o uso real
 * da caixa de feedback — e o que for mais antigo continua na tabela, só não
 * aparece nesta listagem.
 */
const MAX_MONTHS_PER_READ = 12;

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

/** `2026-01` → `2025-12`. */
export function previousMonth(month: string): string {
  const cursor = new Date(`${month}-01T00:00:00Z`);
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  return cursor.toISOString().slice(0, 7);
}

export function toFeedback(raw: Record<string, unknown>): Feedback {
  return Feedback.restore({
    id: typeof raw.feedbackId === 'string' ? raw.feedbackId : '',
    author: typeof raw.author === 'string' ? raw.author : '',
    message: typeof raw.message === 'string' ? raw.message : '',
    submittedAt: typeof raw.submittedAt === 'string' ? raw.submittedAt : '',
  });
}

interface ReadPosition {
  readonly month: string;
  readonly key?: DynamoKey | undefined;
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

  /**
   * Lê o mês corrente de trás para frente e, se a página não encheu, continua
   * no mês anterior. Um mês sem feedback é partição inexistente: a consulta
   * volta vazia e custa o mínimo.
   */
  async findRecent(request: FeedbackPageRequest): Promise<FeedbackPage> {
    const start = this.readPosition(request);
    const items: Feedback[] = [];

    let month = start.month;
    let startKey = start.key;

    for (let monthsRead = 0; monthsRead < MAX_MONTHS_PER_READ; monthsRead += 1) {
      const remaining = request.limit - items.length;

      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :partition',
          ExpressionAttributeValues: {
            ':partition': feedbackKeys.monthPartitionFromMonth(month),
          },
          ScanIndexForward: false,
          Limit: remaining,
          ExclusiveStartKey: startKey,
        }),
      );

      items.push(...(result.Items ?? []).map(toFeedback));

      // O mês ainda tem itens adiante: o cursor retoma exatamente daqui.
      if (result.LastEvaluatedKey) {
        return { items, nextCursor: encodeCursor({ month, key: result.LastEvaluatedKey }) };
      }

      // Mês esgotado. Com a página cheia, o cursor aponta para o mês anterior;
      // sem isso, a próxima leitura releria este.
      if (items.length >= request.limit) {
        return { items, nextCursor: encodeCursor({ month: previousMonth(month) }) };
      }

      month = previousMonth(month);
      startKey = undefined;
    }

    // A janela de leitura acabou antes de encher a página: não há mais o que
    // oferecer nesta listagem.
    return { items, nextCursor: null };
  }

  private readPosition(request: FeedbackPageRequest): ReadPosition {
    const decoded = decodeCursor(request.cursor);
    if (!decoded) return { month: request.latestMonth };

    const month = typeof decoded.month === 'string' ? decoded.month : request.latestMonth;
    const key =
      typeof decoded.key === 'object' && decoded.key !== null
        ? (decoded.key as DynamoKey)
        : undefined;

    return { month, key };
  }
}
