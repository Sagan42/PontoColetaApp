import { useId } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { MIN_TOUCH_TARGET, colors, radius, spacing, typography } from '../tokens';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
}

export function TextField({
  label,
  error,
  hint,
  required = false,
  multiline,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const hasError = Boolean(error);

  return (
    <View style={styles.container}>
      <Text variant="bodyStrong" nativeID={`${id}-label`} style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>

      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={`${id}-label`}
        accessibilityHint={hint}
        aria-invalid={hasError}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          hasError ? styles.inputError : null,
        ]}
        {...inputProps}
      />

      {hasError ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textPrimary,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
});
