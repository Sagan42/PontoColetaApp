import type { Clock } from '../../../../shared/application/ports/index.js';
import type { MetricsRepository, UsageMetricType } from '../../domain/index.js';
import { MetricDay } from '../../domain/index.js';

export interface RegisterUsageMetricInput {
  readonly type: UsageMetricType;
  readonly occurredAt?: Date | undefined;
}

export class RegisterUsageMetric {
  constructor(
    private readonly repository: MetricsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterUsageMetricInput): Promise<void> {
    const occurredAt = input.occurredAt ?? this.clock.now();
    await this.repository.increment(MetricDay.fromDate(occurredAt), input.type, 1);
  }
}
