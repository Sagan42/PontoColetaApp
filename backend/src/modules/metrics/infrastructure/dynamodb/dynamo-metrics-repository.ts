import { QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  DailyUsageMetrics,
  MetricDay,
  MetricPeriod,
  MetricsRepository,
  UsageMetricType,
} from '../../domain/index.js';
import {
  METRICS_ENTITY_TYPE,
  metricsKeys,
  monthsBetween,
  toDailyUsageMetrics,
} from './metrics-item.js';

export class DynamoMetricsRepository implements MetricsRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async increment(day: MetricDay, type: UsageMetricType, amount: number): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: metricsKeys.monthPartition(day),
          SK: metricsKeys.daySortKey(day),
        },
        UpdateExpression: 'SET #entityType = :entityType, #date = :date ADD #counter :amount',
        ExpressionAttributeNames: {
          '#entityType': 'entityType',
          '#date': 'date',
          '#counter': type,
        },
        ExpressionAttributeValues: {
          ':entityType': METRICS_ENTITY_TYPE,
          ':date': day.value,
          ':amount': amount,
        },
      }),
    );
  }

  async findByPeriod(period: MetricPeriod): Promise<DailyUsageMetrics[]> {
    const months = monthsBetween(period.from, period.to);

    const pages = await Promise.all(
      months.map((month) =>
        this.client.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :partition AND SK BETWEEN :from AND :to',
            ExpressionAttributeValues: {
              ':partition': metricsKeys.monthPartitionFromMonth(month),
              ':from': metricsKeys.daySortKeyFromValue(period.from.value),
              ':to': metricsKeys.daySortKeyFromValue(period.to.value),
            },
          }),
        ),
      ),
    );

    return pages.flatMap((page) => (page.Items ?? []).map(toDailyUsageMetrics));
  }
}
