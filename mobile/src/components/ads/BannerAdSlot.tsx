import { StyleSheet, View } from 'react-native';
import { spacing } from '../../design-system';
import { config } from '../../services/config';

interface BannerModule {
  BannerAd: React.ComponentType<{ unitId: string; size: string }>;
  BannerAdSize: Record<string, string>;
  TestIds: Record<string, string>;
}

function loadBannerModule(): BannerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads') as BannerModule;
  } catch {
    return null;
  }
}

export function BannerAdSlot({ testID }: { testID?: string }) {
  if (!config.ads.enabled || config.ads.bannerUnitId.length === 0) {
    return null;
  }

  const module = loadBannerModule();
  if (!module) return null;

  const { BannerAd, BannerAdSize } = module;
  const size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER ?? BannerAdSize.BANNER ?? 'BANNER';

  return (
    <View style={styles.container} testID={testID}>
      <BannerAd unitId={config.ads.bannerUnitId} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
