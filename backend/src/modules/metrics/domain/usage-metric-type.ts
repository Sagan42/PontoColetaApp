import { ValidationError } from '../../../shared/domain/errors/index.js';

export const UsageMetricType = {
  AppOpen: 'app_open',
  SearchByAddress: 'search_address',
  SearchByMaterial: 'search_material',
  PointCreated: 'point_created',
  PointViewed: 'point_viewed',
} as const;

export type UsageMetricType = (typeof UsageMetricType)[keyof typeof UsageMetricType];

export const USAGE_METRIC_TYPES: readonly UsageMetricType[] = Object.values(UsageMetricType);

export const CLIENT_REPORTABLE_METRIC_TYPES: readonly UsageMetricType[] = [
  UsageMetricType.AppOpen,
  UsageMetricType.PointViewed,
];

export function parseUsageMetricType(value: string): UsageMetricType {
  const type = USAGE_METRIC_TYPES.find((candidate) => candidate === value);
  if (!type) {
    throw new ValidationError(`Tipo de métrica inválido: ${value}.`, 'type');
  }
  return type;
}
