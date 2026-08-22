import { describe, expect, it } from 'vitest';
import { buildHermesInstructions, getHermesEmployeeContract } from '../hermes-contracts.js';
import { evaluateHermesToolIntent } from '../hermes-policy.js';
import { HermesAgentRuntime, hermesCapabilitiesReady, hermesSessionId, loadHermesRuntimeConfig } from '../hermes-runtime.js';

describe('Hermes runtime boundary', () => {
  it('is disabled unless the feature flag and private credentials are explicitly configured', () => {
    expect(loadHermesRuntimeConfig({}).enabled).toBe(false);
    expect(loadHermesRuntimeConfig({ HERMES_ENABLED: 'true', HERMES_API_URL: 'https://hermes.internal', HERMES_API_KEY: 'runtime-key' }).enabled).toBe(true);
  });

  it('creates a tenant-and-employee scoped session identity', () => {
    expect(hermesSessionId('company_a', 'data_analyst', 14)).toBe('cw:company_a:data_analyst:14');
    expect(() => hermesSessionId('company/a', 'data_analyst', 14)).toThrow('Invalid Hermes session identity');
  });

  it('requires the full Hermes runs lifecycle before marking a runtime healthy', () => {
    expect(hermesCapabilitiesReady({ features: { run_submission: true, run_status: true, run_events_sse: true, run_stop: true, run_approval: true } })).toBe(true);
    expect(hermesCapabilitiesReady({ features: { run_submission: true, run_status: true, run_events_sse: true, run_stop: true } })).toBe(false);
  });

  it('starts a bounded run using the private bearer contract', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const runtime = new HermesAgentRuntime(loadHermesRuntimeConfig({ HERMES_ENABLED: 'true', HERMES_API_URL: 'https://hermes.internal', HERMES_API_KEY: 'runtime-key' }), {
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ run_id: 'run_123', status: 'started', session_id: 'cw:company_a:data_analyst:14' }), { status: 202, headers: { 'content-type': 'application/json' } });
      }
    });
    const result = await runtime.startRun({ taskId: 14, companyId: 'company_a', employeeId: 'data_analyst', input: 'Review the weekly variance.', instructions: 'Use evidence.' });
    expect(result).toMatchObject({ runtime: 'hermes', runId: 'run_123', status: 'started' });
    expect(calls[0]?.url).toBe('https://hermes.internal/v1/runs');
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: 'Bearer runtime-key', 'Content-Type': 'application/json' });
  });

  it('keeps skills and tool intents constrained to the approved four-employee contracts', () => {
    expect(getHermesEmployeeContract('data_analyst')?.skillIds).toContain('data-analysis');
    expect(getHermesEmployeeContract('not-an-employee')).toBeNull();
    expect(buildHermesInstructions('backend_developer', 'Base role prompt.')).toContain('migration-planning');
    expect(evaluateHermesToolIntent({ companyId: 'company_a', employeeId: 'data_analyst', taskId: 14, intent: 'razorpay.checkout.create' })).toMatchObject({ status: 'blocked', code: 'live_payment_prohibited' });
    expect(evaluateHermesToolIntent({ companyId: 'company_a', employeeId: 'qa_engineer', taskId: 14, intent: 'test.sandbox.run', environment: 'production' })).toMatchObject({ status: 'blocked', code: 'sandbox_required' });
    expect(evaluateHermesToolIntent({ companyId: 'company_a', employeeId: 'data_analyst', taskId: 14, intent: 'workspace.context.read' })).toMatchObject({ status: 'allowed' });
  });
});
