import { z } from 'zod';
import { apiEnvelope, apiRequest } from '../../services/apiClient';

export const collectionPointSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.object({
    line: z.string(),
    city: z.string(),
    state: z.string(),
    formatted: z.string(),
  }),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  materials: z.array(z.object({ label: z.string(), slug: z.string() })),
  openingHours: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.string(),
  distanceKm: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const searchOriginSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  formattedAddress: z.string().nullable(),
});

const collectionPointEnvelope = apiEnvelope(collectionPointSchema);

/**
 * Listings carry the cursor for the next page in `meta.nextCursor`. A malformed
 * one reads as "no more pages": stopping early beats discarding good points.
 */
const listEnvelope = z.object({
  data: z.array(collectionPointSchema),
  meta: z.looseObject({ nextCursor: z.string().nullish().catch(null) }).optional(),
});

/**
 * The nearby endpoint reports where it searched from, under `meta.origin`. The
 * origin only centres the map, so a malformed one falls back to absent instead
 * of discarding points that are perfectly fine.
 */
const nearbyEnvelope = z.object({
  data: z.array(collectionPointSchema),
  meta: z.looseObject({ origin: searchOriginSchema.nullish().catch(null) }).optional(),
});

const materialsEnvelope = apiEnvelope(z.array(z.object({ label: z.string() })));

export type CollectionPoint = z.infer<typeof collectionPointSchema>;
export type SearchOrigin = z.infer<typeof searchOriginSchema>;

export interface CollectionPointsResult {
  points: CollectionPoint[];
  origin: SearchOrigin | null;
  /** `null` once the server has no further page for this query. */
  nextCursor: string | null;
}

export interface CreateCollectionPointPayload {
  name: string;
  address: string;
  materials: string[];
  openingHours?: string | null;
  notes?: string | null;
}

export const collectionPointsApi = {
  async listAll(cursor?: string | null, signal?: AbortSignal): Promise<CollectionPointsResult> {
    const response = await apiRequest('/v1/collection-points', {
      schema: listEnvelope,
      query: { cursor: cursor ?? undefined },
      signal,
    });
    return { points: response.data, origin: null, nextCursor: response.meta?.nextCursor ?? null };
  },

  async searchByMaterial(
    material: string,
    cursor?: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPointsResult> {
    const response = await apiRequest('/v1/collection-points', {
      schema: listEnvelope,
      query: { material, cursor: cursor ?? undefined },
      signal,
    });
    return { points: response.data, origin: null, nextCursor: response.meta?.nextCursor ?? null };
  },

  // Nearby ranks by distance over the covering cells; there is no cursor to
  // follow, so this one stays a single request.
  async searchByAddress(address: string, signal?: AbortSignal): Promise<CollectionPointsResult> {
    const response = await apiRequest('/v1/collection-points/nearby', {
      schema: nearbyEnvelope,
      query: { address },
      signal,
    });

    return { points: response.data, origin: response.meta?.origin ?? null, nextCursor: null };
  },

  async getById(id: string, signal?: AbortSignal): Promise<CollectionPoint> {
    const response = await apiRequest(`/v1/collection-points/${encodeURIComponent(id)}`, {
      schema: collectionPointEnvelope,
      signal,
    });
    return response.data;
  },

  async create(payload: CreateCollectionPointPayload): Promise<CollectionPoint> {
    const response = await apiRequest('/v1/collection-points', {
      schema: collectionPointEnvelope,
      method: 'POST',
      body: payload,
    });
    return response.data;
  },

  async listSuggestedMaterials(signal?: AbortSignal): Promise<string[]> {
    const response = await apiRequest('/v1/materials', {
      schema: materialsEnvelope,
      signal,
    });
    return response.data.map((item) => item.label);
  },
};
