import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  MIN_TOUCH_TARGET,
  Screen,
  Text,
  TextField,
  colors,
  radius,
  spacing,
} from '../../src/design-system';
import { REPORT_REASONS, type ReportReason } from '../../src/features/collection-points/api';
import { useReportCollectionPoint } from '../../src/features/collection-points/hooks';
import { ApiError } from '../../src/services/apiClient';

export default function ReportCollectionPointScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const name = typeof params.name === 'string' ? params.name : '';

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const report = useReportCollectionPoint();

  function submit() {
    if (report.isPending) return;

    if (reason === null) {
      setError('Escolha um motivo para a denúncia.');
      return;
    }

    setError(null);
    report.mutate({ pointId: id, reason, details }, { onSuccess: () => setSent(true) });
  }

  if (sent) {
    return (
      <Screen>
        <View style={styles.success}>
          <Text variant="title" center accessibilityLiveRegion="polite">
            Denúncia enviada
          </Text>
          <Text variant="body" color="textSecondary" center>
            Obrigado por avisar. Vamos analisar e, se for o caso, o ponto sai do ar.
          </Text>
          <Button label="Voltar" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      <Text variant="body" color="textSecondary">
        {name.length > 0
          ? `Conte o que há de errado com "${name}". A denúncia é anônima.`
          : 'Conte o que há de errado com este ponto. A denúncia é anônima.'}
      </Text>

      <View style={styles.reasons}>
        <Text variant="bodyStrong">Motivo *</Text>

        {REPORT_REASONS.map((option) => {
          const selected = option.key === reason;

          return (
            <Pressable
              key={option.key}
              onPress={() => {
                setReason(option.key);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              testID={`reason-${option.key}`}
              style={[styles.reason, selected ? styles.reasonSelected : null]}
            >
              <Text variant="body" color={selected ? 'primaryDark' : 'textSecondary'}>
                {selected ? `✓ ${option.label}` : option.label}
              </Text>
            </Pressable>
          );
        })}

        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>

      <TextField
        label="Detalhes"
        placeholder="Ex.: O endereço não existe nessa rua"
        value={details}
        onChangeText={setDetails}
        hint="Opcional. Ajuda a entender o problema mais rápido."
        multiline
        maxLength={500}
        testID="input-report-details"
      />

      {report.isError ? (
        <Text variant="body" color="danger" accessibilityLiveRegion="assertive">
          {submitErrorMessage(report.error)}
        </Text>
      ) : null}

      <Button
        label="Enviar denúncia"
        onPress={submit}
        loading={report.isPending}
        testID="button-submit-report"
        accessibilityHint="Envia a denúncia para quem modera o aplicativo"
      />
    </Screen>
  );
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Esse ponto não está mais disponível.';
    if (error.status === 429) return 'Muitos envios em sequência. Tente de novo em instantes.';
    return error.message;
  }
  return 'Não foi possível enviar a denúncia. Tente novamente.';
}

const styles = StyleSheet.create({
  reasons: {
    gap: spacing.sm,
  },
  reason: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  reasonSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primarySoft,
  },
  success: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
});
