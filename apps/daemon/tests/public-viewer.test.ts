import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('public viewer mode', () => {
  let server: http.Server;
  let baseUrl: string;
  let envBackup: Record<string, string | undefined>;

  const authHeader = `Basic ${Buffer.from('viewer:secret-pass').toString('base64')}`;

  beforeAll(async () => {
    envBackup = {
      OD_PUBLIC_VIEWER: process.env.OD_PUBLIC_VIEWER,
      OD_PUBLIC_STORE: process.env.OD_PUBLIC_STORE,
      OD_BASIC_AUTH_USERNAME: process.env.OD_BASIC_AUTH_USERNAME,
      OD_BASIC_AUTH_PASSWORD: process.env.OD_BASIC_AUTH_PASSWORD,
      OD_READONLY_MODE: process.env.OD_READONLY_MODE,
    };

    process.env.OD_PUBLIC_VIEWER = '1';
    process.env.OD_PUBLIC_STORE = 'bair-rewind';
    delete process.env.OD_BASIC_AUTH_USERNAME;
    process.env.OD_BASIC_AUTH_PASSWORD = 'secret-pass';
    process.env.OD_READONLY_MODE = '1';

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('requires basic auth for viewer routes', async () => {
    const res = await fetch(`${baseUrl}/api/design-systems`);

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Basic');
  });

  it('filters the list to the locked store and hides other ids', async () => {
    const listRes = await fetch(`${baseUrl}/api/design-systems`, {
      headers: { Authorization: authHeader },
    });
    const list = await listRes.json() as { designSystems: Array<{ id: string }> };

    expect(listRes.ok).toBe(true);
    expect(list.designSystems.map((system) => system.id)).toEqual(['bair-rewind']);

    const allowedRes = await fetch(`${baseUrl}/api/design-systems/bair-rewind`, {
      headers: { Authorization: authHeader },
    });
    expect(allowedRes.ok).toBe(true);

    const blockedRes = await fetch(`${baseUrl}/api/design-systems/airbnb`, {
      headers: { Authorization: authHeader },
    });
    expect(blockedRes.status).toBe(404);
  });

  it('rejects store overrides, non-design-system reads, and write actions', async () => {
    const mismatchedStoreRes = await fetch(`${baseUrl}/api/design-systems?store=airbnb`, {
      headers: { Authorization: authHeader },
    });
    expect(mismatchedStoreRes.status).toBe(404);

    const skillsRes = await fetch(`${baseUrl}/api/skills`, {
      headers: { Authorization: authHeader },
    });
    expect(skillsRes.status).toBe(403);

    const writeRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'demo', name: 'Demo' }),
    });
    expect(writeRes.status).toBe(403);
  });

  it('serves robots.txt as deny-all without authentication', async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    const body = await res.text();

    expect(res.ok).toBe(true);
    expect(body).toContain('Disallow: /');
  });
});
