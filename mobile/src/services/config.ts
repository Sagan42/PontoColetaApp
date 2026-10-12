function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true';
}

export const config = {
  apiUrl: readString(process.env.EXPO_PUBLIC_API_URL, 'http://10.0.2.2:3000'),
  apiTimeoutMs: Number(readString(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, '12000')),

  admin: {
    region: readString(process.env.EXPO_PUBLIC_COGNITO_REGION, 'us-east-1'),
    clientId: readString(process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID, ''),
  },

  ads: {
    enabled: readBoolean(process.env.EXPO_PUBLIC_ADS_ENABLED, false),
    bannerUnitId: readString(process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID, ''),
  },

  cityCentre: {
    latitude: -23.3103,
    longitude: -51.1628,
    name: 'Londrina',
  },
} as const;
