import { apiRequest } from './apiClient';

export type ReportableMetric = 'app_open' | 'point_viewed';

export function reportMetric(type: ReportableMetric): void {
  void apiRequest('/v1/metrics/events', { method: 'POST', body: { type } }).catch(() => undefined);
}
