import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField, spacing } from '../src/design-system';
import { useSubmitFeedback } from '../src/features/feedback/hooks';
import {
  emptyFeedbackForm,
  validateFeedbackForm,
  type FeedbackForm,
  type FeedbackFormErrors,
} from '../src/schemas/feedback';
import { ApiError } from '../src/services/apiClient';

export default function FeedbackScreen() {
  const router = useRouter();
  const [form, setForm] = useState<FeedbackForm>(emptyFeedbackForm);
  const [errors, setErrors] = useState<FeedbackFormErrors>({});
  const [sent, setSent] = useState(false);

  const submitFeedback = useSubmitFeedback();

  function update<K extends keyof FeedbackForm>(field: K, value: FeedbackForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function submit() {
    if (submitFeedback.isPending) return;

    const validation = validateFeedbackForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    submitFeedback.mutate(form, { onSuccess: () => setSent(true) });
  }

  if (sent) {
    return (
      <Screen>
        <View style={styles.success}>
          <Text variant="title" center accessibilityLiveRegion="polite">
            Feedback enviado
          </Text>
          <Text variant="body" color="textSecondary" center>
            Obrigado por escrever. Toda mensagem é lida.
          </Text>
          <Button label="Voltar ao início" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      <Text variant="body" color="textSecondary">
        Conte o que funcionou, o que faltou ou o que atrapalhou. Não é preciso se identificar.
      </Text>

      <TextField
        label="Nome"
        placeholder="Como quer ser chamado"
        value={form.name}
        onChangeText={(value) => update('name', value)}
        error={errors.name}
        hint="Opcional. Em branco, o feedback fica como anônimo."
        maxLength={60}
        autoCapitalize="words"
        testID="input-feedback-name"
      />

      <TextField
        label="Mensagem"
        placeholder="Ex.: Faltou um ponto de coleta no meu bairro"
        value={form.message}
        onChangeText={(value) => update('message', value)}
        error={errors.message}
        multiline
        maxLength={1000}
        required
        testID="input-feedback-message"
      />

      {submitFeedback.isError ? (
        <Text variant="body" color="danger" accessibilityLiveRegion="assertive">
          {submitErrorMessage(submitFeedback.error)}
        </Text>
      ) : null}

      <Button
        label="Enviar feedback"
        onPress={submit}
        loading={submitFeedback.isPending}
        testID="button-submit-feedback"
        accessibilityHint="Envia sua mensagem para quem mantém o app"
      />
    </Screen>
  );
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // 429 vem do limite de taxa da API, não de um erro de quem escreveu.
    if (error.status === 429) return 'Muitos envios em sequência. Tente de novo em instantes.';
    return error.message;
  }
  return 'Não foi possível enviar seu feedback. Tente novamente.';
}

const styles = StyleSheet.create({
  success: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
});
