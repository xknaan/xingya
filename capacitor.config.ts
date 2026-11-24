import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xingya.checkin',
  appName: '星芽打卡',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
