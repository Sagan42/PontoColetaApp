import type { RegisterUsageMetric } from '../../../metrics/application/index.js';
import type { UsageMetricType } from '../../../metrics/domain/index.js';
import type { UsageMetricRecorder } from '../../application/ports/usage-metric-recorder.js';

export class UsageMetricRecorderAdapter implements UsageMetricRecorder {
  constructor(private readonly registerUsageMetric: RegisterUsageMetric) {}

  async record(type: UsageMetricType): Promise<void> {
    await this.registerUsageMetric.execute({ type });
  }
}
