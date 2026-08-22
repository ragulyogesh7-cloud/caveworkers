import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createBridgeApp } from '../hermes-bridge.js';

const servers: Array<ReturnType<ReturnType<typeof createBridgeApp>['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.close();
    await once(server, 'close');
  }));
});

describe('Hermes capability bridge HTTP boundary', () => {
  it('starts only when explicitly requested and rejects unauthenticated MCP calls', async () => {
    const server = createBridgeApp().listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'healthy', bridge: 'caveworkers-capability-bridge' });

    const unauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    });
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toMatchObject({ error: 'Bridge authentication failed.' });
  });
});
