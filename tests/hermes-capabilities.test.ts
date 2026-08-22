import { describe, expect, it } from 'vitest';
import { createHermesCapability, createHermesCapabilityBundle, redactHermesCapabilityTokens, verifyHermesCapability } from '../hermes-capabilities.js';

const signingKey = '0123456789abcdef0123456789abcdef0123456789abcdef';
const scope = { company_id: 'company_a', employee_id: 'data_analyst', task_id: 17, intent: 'workspace.context.read' as const };

describe('Hermes capability tokens', () => {
  it('binds a token to one tenant, employee, task, and intent', () => {
    const token = createHermesCapability(scope, signingKey, 60_000, 1_000);
    expect(verifyHermesCapability(token, signingKey, scope, 2_000)).toMatchObject(scope);
    expect(() => verifyHermesCapability(token, signingKey, { ...scope, employee_id: 'qa_engineer' }, 2_000)).toThrow('scope mismatch');
  });

  it('rejects tampering and expiry', () => {
    const token = createHermesCapability(scope, signingKey, 5_000, 1_000);
    expect(() => verifyHermesCapability(`${token}x`, signingKey, scope, 2_000)).toThrow('signature');
    expect(() => verifyHermesCapability(token, signingKey, scope, 7_000)).toThrow('Expired');
  });

  it('issues one token per allowed tool intent and redacts capability-shaped output', () => {
    const bundle = createHermesCapabilityBundle({ company_id: 'company_a', employee_id: 'data_analyst', task_id: 17 }, ['workspace.context.read', 'workspace.memory.read', 'artifact.draft'], signingKey, 60_000, 1_000);
    expect(Object.keys(bundle)).toEqual(['workspace.context.read', 'workspace.memory.read', 'artifact.draft']);
    expect(bundle['test.sandbox.run']).toBeUndefined();
    expect(verifyHermesCapability(bundle['artifact.draft']!, signingKey, { ...scope, intent: 'artifact.draft' }, 2_000)).toMatchObject({ intent: 'artifact.draft' });
    const output = `Do not expose ${bundle['workspace.context.read']} or ${bundle['artifact.draft']}.`;
    expect(redactHermesCapabilityTokens(output, Object.values(bundle).filter((token): token is string => Boolean(token)))).not.toContain('eyJ');
  });
});
