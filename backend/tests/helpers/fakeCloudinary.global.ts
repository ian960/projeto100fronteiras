import { startFakeCloudinary } from '../fake-cloudinary/server';
import { FAKE_CLOUDINARY } from './cloudinaryTestEnv';

// Vitest global setup: one fake Cloudinary for the whole run, started before
// the first test file and stopped after the last.
export default async function setup() {
  try {
    const fake = await startFakeCloudinary(FAKE_CLOUDINARY);
    return () => fake.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(
        `Port ${FAKE_CLOUDINARY.port} is busy. Is a fake Cloudinary already running ` +
          '(npx tsx tests/fake-cloudinary/server.ts)? Stop it and run the tests again.',
      );
    }
    throw error;
  }
}
