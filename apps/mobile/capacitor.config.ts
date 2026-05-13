import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Placeholder appId — must be replaced before the first store upload.
 * Once an app is published to the App Store / Play Store, the bundle
 * identifier cannot be changed.
 */
const config: CapacitorConfig = {
  appId: 'com.example.sedationpro',
  appName: 'Sedation Pro',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#0b1220',
  },
};

export default config;
