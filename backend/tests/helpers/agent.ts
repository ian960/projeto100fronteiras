import request from 'supertest';
import { createApp } from '../../src/app';
import { TEST_PASSWORD } from '../factories';

export const app = createApp();

// An agent keeps cookies between requests, which is what makes session auth
// testable: log in once, then reuse the same agent.
export function agent() {
  return request.agent(app);
}

export async function loginAs(email: string, password = TEST_PASSWORD) {
  const client = agent();

  const response = await client
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return { client, user: response.body.data.user };
}
