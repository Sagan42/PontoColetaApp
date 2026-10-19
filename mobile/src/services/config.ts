function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export const config = {
  apiUrl: readString(process.env.EXPO_PUBLIC_API_URL, 'http://10.0.2.2:3000'),
  apiTimeoutMs: Number(readString(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, '12000')),

  admin: {
    region: readString(process.env.EXPO_PUBLIC_COGNITO_REGION, 'sa-east-1'),
    clientId: readString(process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID, ''),
  },

  cityCentre: {
    latitude: -23.3103,
    longitude: -51.1628,
    name: 'Londrina',
  },
} as const;
