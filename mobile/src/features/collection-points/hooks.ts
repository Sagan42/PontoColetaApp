import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ApiError } from '../../services/apiClient';
import {
  collectionPointsApi,
  type CollectionPointsResult,
  type CreateCollectionPointPayload,
} from './api';

/** A 4xx will not get better by asking again; anything else gets two tries. */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
    ? false
    : failureCount < 2;
}

export const collectionPointKeys = {
  all: ['collection-points'] as const,
  list: () => [...collectionPointKeys.all, 'list'] as const,
  byMaterial: (material: string) => [...collectionPointKeys.all, 'material', material] as const,
  byAddress: (address: string) => [...collectionPointKeys.all, 'address', address] as const,
  detail: (id: string) => [...collectionPointKeys.all, 'detail', id] as const,
  materials: ['materials'] as const,
};

export type SearchMode = 'address' | 'material' | 'all';

/**
 * Material searches and the full listing walk `meta.nextCursor` page by page.
 * Address search does not: nearby ranks by distance over the covering cells and
 * answers in one shot, so it stays an ordinary query.
 */
export function useCollectionPointSearch(mode: SearchMode, query: string) {
  const trimmed = query.trim();
  const paged = mode !== 'address';

  const pages = useInfiniteQuery({
    queryKey:
      mode === 'material' ? collectionPointKeys.byMaterial(trimmed) : collectionPointKeys.list(),
    enabled: paged && (mode === 'all' || trimmed.length > 0),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      mode === 'material'
        ? collectionPointsApi.searchByMaterial(trimmed, pageParam, signal)
        : collectionPointsApi.listAll(pageParam, signal),
    getNextPageParam: (lastPage: CollectionPointsResult) => lastPage.nextCursor,
    retry: retryUnlessClientError,
  });

  const nearby = useQuery({
    queryKey: collectionPointKeys.byAddress(trimmed),
    enabled: !paged && trimmed.length > 0,
    queryFn: ({ signal }) => collectionPointsApi.searchByAddress(trimmed, signal),
    retry: retryUnlessClientError,
  });

  const active = paged ? pages : nearby;

  const data = useMemo(() => {
    if (!paged) return nearby.data;
    if (!pages.data) return undefined;

    return {
      points: pages.data.pages.flatMap((page) => page.points),
      origin: null,
    };
  }, [paged, nearby.data, pages.data]);

  return {
    data,
    isPending: active.isPending,
    isError: active.isError,
    error: active.error,
    refetch: active.refetch,
    hasNextPage: paged && pages.hasNextPage,
    isFetchingNextPage: paged && pages.isFetchingNextPage,
    fetchNextPage: pages.fetchNextPage,
  };
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
