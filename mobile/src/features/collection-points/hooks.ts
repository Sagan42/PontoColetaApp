import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../services/apiClient';
import { collectionPointsApi, type CreateCollectionPointPayload } from './api';

export const collectionPointKeys = {
  all: ['collection-points'] as const,
  list: () => [...collectionPointKeys.all, 'list'] as const,
  byMaterial: (material: string) => [...collectionPointKeys.all, 'material', material] as const,
  byAddress: (address: string) => [...collectionPointKeys.all, 'address', address] as const,
  detail: (id: string) => [...collectionPointKeys.all, 'detail', id] as const,
  materials: ['materials'] as const,
};

export type SearchMode = 'address' | 'material' | 'all';

export function useCollectionPointSearch(mode: SearchMode, query: string) {
  const trimmed = query.trim();
  const enabled = mode === 'all' || trimmed.length > 0;

  return useQuery({
    queryKey:
      mode === 'material'
        ? collectionPointKeys.byMaterial(trimmed)
        : mode === 'address'
          ? collectionPointKeys.byAddress(trimmed)
          : collectionPointKeys.list(),
    enabled,
    queryFn: ({ signal }) => {
      if (mode === 'material') return collectionPointsApi.searchByMaterial(trimmed, signal);
      if (mode === 'address') return collectionPointsApi.searchByAddress(trimmed, signal);
      return collectionPointsApi.listAll(signal);
    },
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status >= 400 && error.status < 500
        ? false
        : failureCount < 2,
  });
}

export function useCollectionPoint(id: string) {
  return useQuery({
    queryKey: collectionPointKeys.detail(id),
    enabled: id.length > 0,
    queryFn: ({ signal }) => collectionPointsApi.getById(id, signal),
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export function useSuggestedMaterials() {
  return useQuery({
    queryKey: collectionPointKeys.materials,
    queryFn: ({ signal }) => collectionPointsApi.listSuggestedMaterials(signal),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useCreateCollectionPoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCollectionPointPayload) => collectionPointsApi.create(payload),
    onSuccess: (point) => {
      void queryClient.invalidateQueries({ queryKey: collectionPointKeys.all });
      queryClient.setQueryData(collectionPointKeys.detail(point.id), point);
    },
    retry: false,
  });
}
