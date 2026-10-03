import { apiRequest, type ApiEnvelope } from '../../services/apiClient';

export interface CollectionPoint {
  id: string;
  name: string;
  address: { line: string; city: string; state: string; formatted: string };
  location: { latitude: number; longitude: number };
  materials: { label: string; slug: string }[];
  openingHours: string | null;
  notes: string | null;
  status: string;
  distanceKm: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchOrigin {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
}

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
    const response = await apiRequest<ApiEnvelope<CollectionPoint[]>>('/v1/collection-points', {
      signal,
    });
    return { points: response.data, origin: null };
  },

  async searchByMaterial(material: string, signal?: AbortSignal): Promise<CollectionPointsResult> {
    const response = await apiRequest<ApiEnvelope<CollectionPoint[]>>('/v1/collection-points', {
      query: { material },
      signal,
    });
    return { points: response.data, origin: null };
  },

  async searchByAddress(address: string, signal?: AbortSignal): Promise<CollectionPointsResult> {
    const response = await apiRequest<ApiEnvelope<CollectionPoint[]>>(
      '/v1/collection-points/nearby',
      { query: { address }, signal },
    );

    const origin = (response.meta?.origin as SearchOrigin | undefined) ?? null;
    return { points: response.data, origin };
  },

  async getById(id: string, signal?: AbortSignal): Promise<CollectionPoint> {
    const response = await apiRequest<ApiEnvelope<CollectionPoint>>(
      `/v1/collection-points/${encodeURIComponent(id)}`,
      { signal },
    );
    return response.data;
  },

  async create(payload: CreateCollectionPointPayload): Promise<CollectionPoint> {
    const response = await apiRequest<ApiEnvelope<CollectionPoint>>('/v1/collection-points', {
      method: 'POST',
      body: payload,
    });
    return response.data;
  },

  async listSuggestedMaterials(signal?: AbortSignal): Promise<string[]> {
    const response = await apiRequest<ApiEnvelope<{ label: string }[]>>('/v1/materials', {
      signal,
    });
    return response.data.map((item) => item.label);
  },
};
