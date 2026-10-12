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

const collectionPointsEnvelope = apiEnvelope(z.array(collectionPointSchema));
const collectionPointEnvelope = apiEnvelope(collectionPointSchema);

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
}

export interface CreateCollectionPointPayload {
  name: string;
  address: string;
  materials: string[];
  openingHours?: string | null;
  notes?: string | null;
}

export const collectionPointsApi = {
  async listAll(signal?: AbortSignal): Promise<CollectionPointsResult> {
    const response = await apiRequest('/v1/collection-points', {
      schema: collectionPointsEnvelope,
      signal,
    });
    return { points: response.data, origin: null };
  },

  async searchByMaterial(material: string, signal?: AbortSignal): Promise<CollectionPointsResult> {
    const response = await apiRequest('/v1/collection-points', {
      schema: collectionPointsEnvelope,
      query: { material },
      signal,
    });
    return { points: response.data, origin: null };
  },

  async searchByAddress(address: string, signal?: AbortSignal): Promise<CollectionPointsResult> {
    const response = await apiRequest('/v1/collection-points/nearby', {
      schema: nearbyEnvelope,
      query: { address },
      signal,
    });

    return { points: response.data, origin: response.meta?.origin ?? null };
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
