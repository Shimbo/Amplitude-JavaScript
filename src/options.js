import language from './language';

let platform = 'Web';

export default {
  apiEndpoint: 'api.amplitude.com',
  batchEvents: false,
  cookieExpiration: 365 * 10,
  cookieName: 'amplitude_id',
  path: '/',
  eventUploadPeriodMillis: 30 * 1000, // 30s
  eventUploadThreshold: 30,
  forceHttps: true,
  language: language.language,
  logLevel: 'WARN',
  optOut: false,
  onError: () => {},
  platform,
  secureCookie: false,
  sessionTimeout: 30 * 60 * 1000,
  trackingOptions: {
    city: true,
    country: true,
    carrier: true,
    device_manufacturer: true,
    device_model: true,
    dma: true,
    ip_address: true,
    language: true,
    os_name: true,
    os_version: true,
    platform: true,
    region: true,
    version_name: true
  },
  unsentKey: 'amplitude_unsent',
  unsentIdentifyKey: 'amplitude_unsent_identify',
  uploadBatchSize: 100,
};
