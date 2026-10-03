export const colors = {
  primary: '#1B7A46',
  primaryDark: '#145C34',
  primaryPressed: '#11492A',
  primarySoft: '#E3F1E8',
  primaryBorder: '#B7DAC5',

  background: '#F4F8F5',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF3F0',

  textPrimary: '#10201A',
  textSecondary: '#40514A',
  textMuted: '#5F706A',
  textInverse: '#FFFFFF',

  border: '#DCE6E0',
  borderStrong: '#B9C7C0',

  danger: '#B3261E',
  dangerSoft: '#FCEDEC',
  warning: '#8A5300',
  warningSoft: '#FBF0DE',
  info: '#1F5FA8',

  overlay: 'rgba(16, 32, 26, 0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  button: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
} as const;

export const shadows = {
  card: {
    shadowColor: '#10201A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#10201A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const MIN_TOUCH_TARGET = 48;
