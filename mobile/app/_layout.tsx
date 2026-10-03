import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/design-system';
import { reportMetric } from '../src/services/metrics';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    reportMetric('app_open');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primaryDark,
            headerTitleStyle: { color: colors.textPrimary, fontWeight: '600' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="results" options={{ title: 'Resultados' }} />
          <Stack.Screen name="point/[id]" options={{ title: 'Ponto de coleta' }} />
          <Stack.Screen name="new-point" options={{ title: 'Cadastrar ponto' }} />
          <Stack.Screen name="admin/index" options={{ title: 'Métricas' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
