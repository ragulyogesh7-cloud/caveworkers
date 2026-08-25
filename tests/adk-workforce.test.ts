import { describe, expect, it } from 'vitest';
import {
  ADK_EMPLOYEE_AGENTS,
  ADK_EMPLOYEE_DEFINITIONS,
  ADK_MANAGER_AGENT,
  evaluateAdkPermission,
  getAdkEmployeeDefinition,
  runAdkWorkforce,
} from '../src/adk/workforce.js';

describe('Google ADK workforce contracts', () => {
  it('defines exactly four specialized employees under the manager', () => {
    expect(ADK_EMPLOYEE_DEFINITIONS.map((employee) => employee.id)).toEqual([
      'data_analyst',
      'cybersecurity_analyst',
      'backend_developer',
      'qa_engineer',
    ]);
    expect(Object.keys(ADK_EMPLOYEE_AGENTS)).toHaveLength(4);
    expect(ADK_MANAGER_AGENT.name).toBe('caveworkers_manager');
    expect(ADK_MANAGER_AGENT.subAgents.map((agent) => agent.name)).toEqual([
      'data_analyst',
      'cybersecurity_analyst',
      'backend_developer',
      'qa_engineer',
    ]);
  });

  it('keeps the role registry authoritative for employee identity and mission', () => {
    expect(getAdkEmployeeDefinition('BACKEND_DEVELOPER')).toMatchObject({
      name: 'Arav',
      role: 'Full Stack Backend Developer',
    });
    expect(getAdkEmployeeDefinition('not-an-employee')).toBeUndefined();
  });

  it('does not start a remote ADK run when model credentials are unavailable', async () => {
    const previousApiKey = process.env.GOOGLE_GENAI_API_KEY;
    const previousVertexFlag = process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.GOOGLE_GENAI_API_KEY;
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    const result = await runAdkWorkforce({ companyId: 'company_a', taskId: 14, prompt: 'test' });
    if (previousApiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = previousApiKey;
    if (previousVertexFlag === undefined) delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    else process.env.GOOGLE_GENAI_USE_VERTEXAI = previousVertexFlag;
    expect(result.status).toBe('disabled');
  });

  it('enforces allow, deny, and approval-required outcomes server-side', () => {
    expect(evaluateAdkPermission('data_analyst', 'analytics.db.read')).toMatchObject({ decision: 'ALLOW' });
    expect(evaluateAdkPermission('backend_developer', 'production.database.write', 'production')).toMatchObject({ decision: 'APPROVAL_REQUIRED' });
    expect(evaluateAdkPermission('backend_developer', 'repository.delete')).toMatchObject({ decision: 'DENY' });
    expect(evaluateAdkPermission('data_analyst', 'cross_tenant.data.read')).toMatchObject({ decision: 'DENY' });
  });
});
