import { DailyUsageMetrics, USAGE_METRIC_TYPES, type UsageCounters } from '../../domain/index.js';
import { MetricDay } from '../../domain/index.js';

export const METRICS_ENTITY_TYPE = 'DailyUsageMetrics';

export const metricsKeys = {
  monthPartition: (day: MetricDay): string => `METRICS#${day.value.slice(0, 7)}`,
  monthPartitionFromMonth: (month: string): string => `METRICS#${month}`,
  daySortKey: (day: MetricDay): string => `DATE#${day.value}`,
  daySortKeyFromValue: (value: string): string => `DATE#${value}`,
} as const;

export function toDailyUsageMetrics(raw: Record<string, unknown>): DailyUsageMetrics {
  const date = typeof raw.date === 'string' ? raw.date : '';
  const counters: Partial<UsageCounters> = {};

  for (const type of USAGE_METRIC_TYPES) {
    const value = raw[type];
    if (typeof value === 'number') {
      counters[type] = value;
    }
  }

  return DailyUsageMetrics.restore(MetricDay.parse(date), counters);
}

export function monthsBetween(from: MetricDay, to: MetricDay): string[] {
  const months: string[] = [];
  const cursor = new Date(`${from.value.slice(0, 7)}-01T00:00:00Z`);
  const last = to.value.slice(0, 7);

  for (let guard = 0; guard < 24; guard += 1) {
    const month = cursor.toISOString().slice(0, 7);
    months.push(month);
    if (month >= last) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}
