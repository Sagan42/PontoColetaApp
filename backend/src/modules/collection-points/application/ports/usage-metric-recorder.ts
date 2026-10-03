import type { UsageMetricType } from '../../../metrics/domain/index.js';

export interface UsageMetricRecorder {
  record(type: UsageMetricType): Promise<void>;
}
