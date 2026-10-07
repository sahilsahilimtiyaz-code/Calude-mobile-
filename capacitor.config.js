/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
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

module.exports = config;
