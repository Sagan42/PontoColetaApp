import { ValidationError } from '../../../shared/domain/errors/index.js';

export const CollectionPointStatus = {
  Published: 'PUBLISHED',
  Hidden: 'HIDDEN',
} as const;

export type CollectionPointStatus =
  (typeof CollectionPointStatus)[keyof typeof CollectionPointStatus];

export const COLLECTION_POINT_STATUSES: readonly CollectionPointStatus[] =
  Object.values(CollectionPointStatus);

export function parseCollectionPointStatus(value: string): CollectionPointStatus {
  const status = COLLECTION_POINT_STATUSES.find((candidate) => candidate === value);
  if (!status) {
    throw new ValidationError(`Status inválido: ${value}.`, 'status');
  }
  return status;
}

export function isPubliclyVisible(status: CollectionPointStatus): boolean {
  return status === CollectionPointStatus.Published;
}
