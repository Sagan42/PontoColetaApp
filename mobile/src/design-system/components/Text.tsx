import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, typography } from '../tokens';

type Variant = keyof typeof typography;

export interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: keyof typeof colors;
  center?: boolean;
}

export function Text({
  variant = 'body',
  color = 'textPrimary',
  center = false,
  style,
  ...rest
}: TextProps) {
  const token = typography[variant];

  const base: TextStyle = {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    fontWeight: token.fontWeight as TextStyle['fontWeight'],
    color: colors[color],
    textAlign: center ? 'center' : 'auto',
  };

  return <RNText style={[base, style]} {...rest} />;
}
