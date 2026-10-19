import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Screen, Text, TextField, spacing } from '../src/design-system';
import { WeekdaySelector } from '../src/features/collection-points/components/WeekdaySelector';
import {
  useCreateCollectionPoint,
  useSuggestedMaterials,
} from '../src/features/collection-points/hooks';
import {
  composeAddress,
  composeOpeningHours,
  emptyCollectionPointForm,
  maskTime,
  onlyDigits,
  validateCollectionPointForm,
  type CollectionPointForm,
  type FormErrors,
} from '../src/schemas/collectionPoint';
import { ApiError } from '../src/services/apiClient';

export default function NewCollectionPointScreen() {
  const router = useRouter();
  const [form, setForm] = useState<CollectionPointForm>(emptyCollectionPointForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [customMaterial, setCustomMaterial] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  const suggestions = useSuggestedMaterials();
  const createPoint = useCreateCollectionPoint();

  function update<K extends keyof CollectionPointForm>(field: K, value: CollectionPointForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function toggleMaterial(label: string) {
    const selected = form.materials.includes(label);
    update(
      'materials',
      selected ? form.materials.filter((item) => item !== label) : [...form.materials, label],
    );
  }

  function addCustomMaterial() {
    const label = customMaterial.trim();
    if (label.length < 2 || form.materials.includes(label)) return;
    update('materials', [...form.materials, label]);
    setCustomMaterial('');
  }

  function submit() {
    if (createPoint.isPending) return;

    const validation = validateCollectionPointForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    // A API recebe endereço e horário como texto. Montá-los aqui, a partir de
    // campos separados, padroniza a exibição e entrega à geocodificação uma
    // linha sempre no mesmo formato.
    createPoint.mutate(
      {
        name: form.name.trim(),
        address: composeAddress(form),
        materials: form.materials,
        openingHours: composeOpeningHours(form),
        notes: form.notes.trim() || null,
      },
      { onSuccess: (point) => setCreatedId(point.id) },
    );
  }

  if (createdId) {
    return (
      <Screen>
        <View style={styles.success}>
          <Text variant="title" center accessibilityLiveRegion="polite">
            Ponto cadastrado com sucesso
          </Text>
          <Text variant="body" color="textSecondary" center>
            Obrigado por contribuir. O ponto já aparece nas buscas.
          </Text>
          <Button
            label="Ver o ponto cadastrado"
            onPress={() => router.replace({ pathname: '/point/[id]', params: { id: createdId } })}
          />
          <Button label="Voltar ao início" variant="ghost" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      <Text variant="body" color="textSecondary">
        Preencha os dados do local. Confirmamos o endereço automaticamente.
      </Text>

      <TextField
        label="Nome do lugar"
        placeholder="Ex.: Ecoponto Centro"
        value={form.name}
        onChangeText={(value) => update('name', value)}
        error={errors.name}
        required
        testID="input-name"
      />

      <TextField
        label="Rua ou avenida"
        placeholder="Ex.: Rua Pará"
        value={form.street}
        onChangeText={(value) => update('street', value)}
        error={errors.street}
        autoCapitalize="words"
        required
        testID="input-street"
      />

      <View style={styles.addressRow}>
        <View style={styles.numberField}>
          <TextField
            label="Número"
            placeholder="500"
            value={form.number}
            onChangeText={(value) => update('number', onlyDigits(value))}
            error={errors.number}
            keyboardType="number-pad"
            maxLength={10}
            required
            testID="input-number"
          />
        </View>
        <View style={styles.neighborhoodField}>
          <TextField
            label="Bairro"
            placeholder="Ex.: Centro"
            value={form.neighborhood}
            onChangeText={(value) => update('neighborhood', value)}
            error={errors.neighborhood}
            autoCapitalize="words"
            required
            testID="input-neighborhood"
          />
        </View>
      </View>

      <Card>
        <Text variant="bodyStrong">Materiais aceitos *</Text>
        <Text variant="caption" color="textMuted">
          Toque para selecionar ou digite um material que não esteja na lista.
        </Text>

        <View style={styles.materials}>
          {(suggestions.data ?? []).map((label) => (
            <Chip
              key={label}
              label={label}
              selected={form.materials.includes(label)}
              onPress={() => toggleMaterial(label)}
              testID={`material-${label}`}
            />
          ))}
        </View>

        {form.materials.filter((label) => !(suggestions.data ?? []).includes(label)).length > 0 ? (
          <View style={styles.materials}>
            {form.materials
              .filter((label) => !(suggestions.data ?? []).includes(label))
              .map((label) => (
                <Chip key={label} label={label} selected onPress={() => toggleMaterial(label)} />
              ))}
          </View>
        ) : null}

        <View style={styles.customMaterial}>
          <View style={styles.customMaterialField}>
            <TextField
              label="Outro material"
              placeholder="Ex.: Cápsulas de café"
              value={customMaterial}
              onChangeText={setCustomMaterial}
              onSubmitEditing={addCustomMaterial}
              returnKeyType="done"
              testID="input-custom-material"
            />
          </View>
          <Button
            label="Adicionar"
            variant="secondary"
            onPress={addCustomMaterial}
            style={styles.customMaterialButton}
            testID="button-add-material"
          />
        </View>

        {errors.materials ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {errors.materials}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="bodyStrong">Horário de funcionamento</Text>
        <Text variant="caption" color="textMuted">
          Opcional. Se informar, marque os dias e preencha os dois horários.
        </Text>

        <View style={styles.weekdays}>
          <WeekdaySelector
            value={form.weekdays}
            onChange={(next) => update('weekdays', next)}
            error={errors.weekdays}
          />
        </View>

        <View style={styles.hoursRow}>
          <View style={styles.hourField}>
            <TextField
              label="Abre às"
              placeholder="08:00"
              value={form.opensAt}
              onChangeText={(value) => update('opensAt', maskTime(value))}
              error={errors.opensAt}
              keyboardType="number-pad"
              maxLength={5}
              testID="input-opens-at"
            />
          </View>
          <View style={styles.hourField}>
            <TextField
              label="Fecha às"
              placeholder="18:00"
              value={form.closesAt}
              onChangeText={(value) => update('closesAt', maskTime(value))}
              error={errors.closesAt}
              keyboardType="number-pad"
              maxLength={5}
              testID="input-closes-at"
            />
          </View>
        </View>
      </Card>

      <TextField
        label="Observações / detalhes"
        placeholder="Ex.: Entrada pela lateral do prédio"
        value={form.notes}
        onChangeText={(value) => update('notes', value)}
        error={errors.notes}
        multiline
        testID="input-notes"
      />

      {createPoint.isError ? (
        <Text variant="body" color="danger" accessibilityLiveRegion="assertive">
          {submitErrorMessage(createPoint.error)}
        </Text>
      ) : null}

      <Button
        label="Cadastrar ponto"
        onPress={submit}
        loading={createPoint.isPending}
        testID="button-submit-point"
        accessibilityHint="Envia o cadastro do ponto de coleta"
      />
    </Screen>
  );
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CONFLICT') return 'Esse ponto de coleta já está cadastrado.';
    return error.message;
  }
  return 'Não foi possível cadastrar o ponto. Tente novamente.';
}

const styles = StyleSheet.create({
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  numberField: {
    flex: 2,
  },
  neighborhoodField: {
    flex: 3,
  },
  materials: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  customMaterial: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  customMaterialField: {
    flex: 1,
  },
  customMaterialButton: {
    marginBottom: spacing.lg,
  },
  weekdays: {
    marginTop: spacing.md,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  hourField: {
    flex: 1,
  },
  success: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
});
