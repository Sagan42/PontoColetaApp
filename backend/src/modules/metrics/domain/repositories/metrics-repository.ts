import type { DailyUsageMetrics } from '../daily-usage-metrics.js';
import type { UsageMetricType } from '../usage-metric-type.js';
import type { MetricDay } from '../value-objects/metric-day.js';
import type { MetricPeriod } from '../value-objects/metric-period.js';

export interface MetricsRepository {
  increment(day: MetricDay, type: UsageMetricType, amount: number): Promise<void>;
  findByPeriod(period: MetricPeriod): Promise<DailyUsageMetrics[]>;
}
