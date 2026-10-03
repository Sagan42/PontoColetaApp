import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../src/shared/domain/errors/index.js';
import { decodeCursor, encodeCursor } from '../../src/shared/infrastructure/dynamodb/pagination.js';
import {
  MetricDay,
  MetricPeriod,
  UsageMetricType,
} from '../../src/modules/metrics/domain/index.js';
import { DynamoMetricsRepository } from '../../src/modules/metrics/infrastructure/dynamodb/dynamo-metrics-repository.js';
import {
  monthsBetween,
  toDailyUsageMetrics,
} from '../../src/modules/metrics/infrastructure/dynamodb/metrics-item.js';

describe('pagination cursor', () => {
  it('round-trips a DynamoDB key', () => {
    const key = { PK: 'CITY#LONDRINA', SK: 'POINT#abc' };
    const cursor = encodeCursor(key);

    expect(cursor).not.toBeNull();
    expect(decodeCursor(cursor ?? undefined)).toEqual(key);
  });

  it('returns null when there is no next page', () => {
    expect(encodeCursor(undefined)).toBeNull();
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it('rejects a tampered cursor', () => {
    expect(() => decodeCursor('não-é-base64!!')).toThrow(ValidationError);
  });
});

describe('metrics item helpers', () => {
  it('lists the months a period spans', () => {
    expect(monthsBetween(MetricDay.parse('2026-08-20'), MetricDay.parse('2026-08-22'))).toEqual([
      '2026-08',
    ]);
    expect(monthsBetween(MetricDay.parse('2025-12-30'), MetricDay.parse('2026-02-02'))).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('reads counters from a stored item, ignoring unknown attributes', () => {
    const metrics = toDailyUsageMetrics({
      date: '2026-08-22',
      app_open: 10,
      search_address: 4,
      entityType: 'DailyUsageMetrics',
    });

    expect(metrics.counters.app_open).toBe(10);
    expect(metrics.counters.search_address).toBe(4);
    expect(metrics.counters.point_created).toBe(0);
  });
});

function stubClient(responses: unknown[] = []) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  let index = 0;

  const send = vi.fn(
    (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      const response = responses[index] ?? {};
      index += 1;
      return Promise.resolve(response);
    },
  );

  return { client: { send } as unknown as DynamoDBDocumentClient, sent };
}

describe('DynamoMetricsRepository', () => {
  it('increments a daily counter atomically', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoMetricsRepository(client, 'pontocoleta-test');

    await repository.increment(MetricDay.parse('2026-08-22'), UsageMetricType.AppOpen, 1);

    expect(sent[0]?.name).toBe('UpdateCommand');
    expect(sent[0]?.input.Key).toEqual({ PK: 'METRICS#2026-08', SK: 'DATE#2026-08-22' });
    expect(sent[0]?.input.UpdateExpression).toContain('ADD #counter :amount');
    expect(sent[0]?.input.ExpressionAttributeNames).toMatchObject({ '#counter': 'app_open' });
  });

  it('queries one partition per month of the period', async () => {
    const { client, sent } = stubClient([
      { Items: [{ date: '2025-12-31', app_open: 2 }] },
      { Items: [{ date: '2026-01-01', app_open: 3 }] },
    ]);
    const repository = new DynamoMetricsRepository(client, 'pontocoleta-test');

    const metrics = await repository.findByPeriod(
      MetricPeriod.create(MetricDay.parse('2025-12-31'), MetricDay.parse('2026-01-01')),
    );

    expect(sent).toHaveLength(2);
    expect(sent.map((command) => command.input.ExpressionAttributeValues)).toMatchObject([
      { ':partition': 'METRICS#2025-12' },
      { ':partition': 'METRICS#2026-01' },
    ]);
    expect(metrics.map((entry) => entry.day.value)).toEqual(['2025-12-31', '2026-01-01']);
  });
});
