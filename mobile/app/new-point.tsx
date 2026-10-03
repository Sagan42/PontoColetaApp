import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Screen, Text, TextField, spacing } from '../src/design-system';
import {
  useCreateCollectionPoint,
  useSuggestedMaterials,
} from '../src/features/collection-points/hooks';
import {
  emptyCollectionPointForm,
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

    createPoint.mutate(
      {
        name: form.name.trim(),
        address: form.address.trim(),
        materials: form.materials,
        openingHours: form.openingHours.trim() || null,
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
        label="Endereço"
        placeholder="Ex.: Rua Pará, 500"
        value={form.address}
        onChangeText={(value) => update('address', value)}
        error={errors.address}
        hint="Rua, número e bairro em Londrina."
        required
        testID="input-point-address"
      />

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

      <TextField
        label="Horário de funcionamento"
        placeholder="Ex.: Seg a Sex, 8h às 18h"
        value={form.openingHours}
        onChangeText={(value) => update('openingHours', value)}
        error={errors.openingHours}
        testID="input-opening-hours"
      />

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
  success: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
});
