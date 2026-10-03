import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cached: DynamoDBDocumentClient | null = null;

export function getDocumentClient(region: string): DynamoDBDocumentClient {
  if (cached) return cached;

  cached = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
  });

  return cached;
}

export function resetDocumentClient(): void {
  cached = null;
}
