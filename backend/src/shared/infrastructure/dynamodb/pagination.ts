import { ValidationError } from '../../domain/errors/index.js';

export type DynamoKey = Record<string, unknown>;

export function encodeCursor(key: DynamoKey | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): DynamoKey | undefined {
  if (!cursor) return undefined;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      throw new Error('cursor is not an object');
    }
    return decoded as DynamoKey;
  } catch {
    throw new ValidationError('Cursor de paginação inválido.', 'cursor');
  }
}
