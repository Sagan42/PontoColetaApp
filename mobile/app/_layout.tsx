import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/design-system';
import { FeedbackFab } from '../src/features/feedback/components/FeedbackFab';
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
        {/* O botão de feedback vive fora do Stack para ficar acima de qualquer
            tela e sobreviver à navegação. */}
        <View style={styles.root}>
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
            <Stack.Screen name="search" options={{ title: 'Buscar' }} />
            <Stack.Screen name="results" options={{ title: 'Resultados' }} />
            <Stack.Screen name="point/[id]" options={{ title: 'Ponto de coleta' }} />
            <Stack.Screen name="new-point" options={{ title: 'Cadastrar ponto' }} />
            <Stack.Screen name="feedback" options={{ title: 'Feedback' }} />
            <Stack.Screen name="admin/index" options={{ title: 'Métricas' }} />
          </Stack>

          <FeedbackFab />
        </View>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
