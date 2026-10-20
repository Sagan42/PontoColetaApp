import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { decodeCursor, encodeCursor, type DynamoKey } from './pagination.js';

/**
 * Quantos meses uma única leitura caminha para trás antes de parar.
 *
 * Quem particiona por mês não tem como provar o fim do passado: sem um teto,
 * uma listagem de meses vazios consultaria partições para sempre. Doze meses
 * cobrem o uso real — e o que for mais antigo continua na tabela, só não
 * aparece na listagem.
 */
export const MAX_MONTHS_PER_READ = 12;

export interface MonthlyPageRequest {
  readonly limit: number;
  readonly cursor?: string | undefined;
  /** Mês mais recente a consultar, `AAAA-MM`. A leitura caminha para trás dele. */
  readonly latestMonth: string;
}

export interface MonthlyPage<T> {
  readonly items: T[];

  /**
   * Chave opaca para retomar, ou `null` quando a janela de leitura terminou.
   * Como nas outras listagens, um cursor não promete haver mais itens: promete
   * apenas que a fonte não era sabidamente o fim.
   */
  readonly nextCursor: string | null;
}

/** `2026-01` → `2025-12`. */
export function previousMonth(month: string): string {
  const cursor = new Date(`${month}-01T00:00:00Z`);
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  return cursor.toISOString().slice(0, 7);
}

interface ReadPosition {
  readonly month: string;
  readonly key?: DynamoKey | undefined;
}

function readPosition(request: MonthlyPageRequest): ReadPosition {
  const decoded = decodeCursor(request.cursor);
  if (!decoded) return { month: request.latestMonth };

  const month = typeof decoded.month === 'string' ? decoded.month : request.latestMonth;
  const key =
    typeof decoded.key === 'object' && decoded.key !== null
      ? (decoded.key as DynamoKey)
      : undefined;

  return { month, key };
}

export interface MonthlyReadOptions<T> {
  readonly client: DynamoDBDocumentClient;
  readonly tableName: string;
  /** Monta a chave de partição do mês, por exemplo `FEEDBACK#2026-10`. */
  readonly partitionFor: (month: string) => string;
  readonly toDomain: (raw: Record<string, unknown>) => T;
  readonly request: MonthlyPageRequest;
}

/**
 * Lê partições mensais do mais recente para o mais antigo.
 *
 * Consulta o mês corrente em ordem decrescente e, se a página não encheu,
 * continua no mês anterior. Um mês sem itens é partição inexistente: a consulta
 * volta vazia e custa o mínimo.
 */
export async function readMonthlyPartitions<T>(
  options: MonthlyReadOptions<T>,
): Promise<MonthlyPage<T>> {
  const { client, tableName, partitionFor, toDomain, request } = options;

  const start = readPosition(request);
  const items: T[] = [];

  let month = start.month;
  let startKey = start.key;

  for (let monthsRead = 0; monthsRead < MAX_MONTHS_PER_READ; monthsRead += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :partition',
        ExpressionAttributeValues: { ':partition': partitionFor(month) },
        ScanIndexForward: false,
        Limit: request.limit - items.length,
        ExclusiveStartKey: startKey,
      }),
    );

    items.push(...(result.Items ?? []).map(toDomain));

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
