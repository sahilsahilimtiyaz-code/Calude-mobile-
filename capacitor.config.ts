import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.claudeluxe.app',
  appName: 'Claude Luxe',
  webDir: 'www',
  backgroundColor: '#08080c',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
