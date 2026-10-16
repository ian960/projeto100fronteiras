// One place for the fake Cloudinary's settings, read by vitest.config.mts
// (to set the environment), the global setup (to start it) and the tests.
export const FAKE_CLOUDINARY = {
  port: Number(process.env.FAKE_CLOUDINARY_PORT ?? 4599),
  cloudName: 'test-cloud',
  apiKey: 'test_key',
  apiSecret: 'test_secret',
  folder: 'portal-test',
};

const base = `http://127.0.0.1:${FAKE_CLOUDINARY.port}`;

// What src/config/env.ts reads. Points the API at the fake instead of
// api.cloudinary.com and res.cloudinary.com.
export const FAKE_CLOUDINARY_ENV = {
  CLOUDINARY_URL: `cloudinary://${FAKE_CLOUDINARY.apiKey}:${FAKE_CLOUDINARY.apiSecret}@${FAKE_CLOUDINARY.cloudName}`,
  CLOUDINARY_FOLDER: FAKE_CLOUDINARY.folder,
  CLOUDINARY_API_BASE: base,
  CLOUDINARY_DELIVERY_BASE: base,
};
