import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entrypoint = join(projectRoot, 'hermes-runtime', 'entrypoint.sh');

describe('private Hermes runtime profile', () => {
  it('loads its generated profile and exposes only the Caveworkers MCP toolset to the Runs API', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'caveworkers-hermes-profile-'));
    const capturePath = join(sandbox, 'config.yaml');
    const fakeHermesPath = join(sandbox, 'hermes');
    writeFileSync(
      fakeHermesPath,
      '#!/bin/sh\nset -eu\ncp "$HERMES_HOME/config.yaml" "$HERMES_CAPTURE_PATH"\nprintf "%s" "$*" > "$HERMES_CAPTURE_PATH.args"\n',
      'utf8'
    );
    chmodSync(fakeHermesPath, 0o755);

    try {
      const execution = spawnSync('sh', [entrypoint], {
        env: {
          ...process.env,
          PATH: `${sandbox}:${process.env.PATH ?? ''}`,
          API_SERVER_KEY: 'unit-test-api-key',
          OPENROUTER_API_KEY: 'unit-test-openrouter-key',
          HERMES_MCP_BRIDGE_URL: 'https://bridge.internal/mcp',
          HERMES_MCP_BRIDGE_TOKEN: 'unit-test-bridge-bearer',
          HERMES_CAPTURE_PATH: capturePath,
          CAVEWORKERS_HERMES_HOME: join(sandbox, 'hermes-home')
        },
        encoding: 'utf8'
      });
      expect(execution.status).toBe(0);
      expect(execution.stderr).toBe('');

      const profile = readFileSync(capturePath, 'utf8');
      expect(readFileSync(`${capturePath}.args`, 'utf8')).toBe('gateway run');
      expect(profile).toContain('platform_toolsets:\n  api_server:\n    - mcp-caveworkers-bridge');
      expect(profile).not.toMatch(/^toolsets:/m);
      expect(profile).toContain('gateway:\n  platforms:\n    api_server:\n      direct_model_requests: false');
      expect(profile).toContain('    - terminal\n    - file\n    - browser');
      expect(profile).toContain('        - workspace_context_read');
      expect(profile).toContain('        - employee_memory_read');
      expect(profile).toContain('        - artifact_draft');
      expect(profile).toContain('        - sandbox_test_request');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
