export type HermesEmployeeContract = {
  employeeId: 'data_analyst' | 'cybersecurity_analyst' | 'backend_developer' | 'qa_engineer';
  skillIds: string[];
  allowedToolIntents: string[];
  maxIterations: number;
  maxToolCalls: number;
  systemAddendum: string;
};

export const HERMES_EMPLOYEE_CONTRACTS: Record<HermesEmployeeContract['employeeId'], HermesEmployeeContract> = {
  data_analyst: {
    employeeId: 'data_analyst',
    skillIds: ['data-analysis', 'sql-analysis', 'anomaly-detection', 'business-reporting'],
    allowedToolIntents: ['workspace.context.read', 'workspace.memory.read', 'artifact.draft'],
    maxIterations: 8,
    maxToolCalls: 8,
    systemAddendum: 'Use only read-only approved evidence. Produce decision-ready analysis and draft artifacts. Do not execute a write, send a message, or handle a live payment.'
  },
  cybersecurity_analyst: {
    employeeId: 'cybersecurity_analyst',
    skillIds: ['security-log-analysis', 'dependency-audit', 'configuration-audit', 'incident-triage'],
    allowedToolIntents: ['workspace.context.read', 'workspace.memory.read', 'artifact.draft'],
    maxIterations: 8,
    maxToolCalls: 6,
    systemAddendum: 'Perform defensive, evidence-led analysis only. Do not scan, exploit, alter identity, handle credentials, or perform any production write.'
  },
  backend_developer: {
    employeeId: 'backend_developer',
    skillIds: ['repository-analysis', 'debugging', 'api-design', 'migration-planning', 'code-review'],
    allowedToolIntents: ['workspace.context.read', 'workspace.memory.read', 'artifact.draft'],
    maxIterations: 10,
    maxToolCalls: 8,
    systemAddendum: 'Propose the smallest reversible engineering change. Do not write a repository, execute a migration, deploy, change secrets, or create a payment operation.'
  },
  qa_engineer: {
    employeeId: 'qa_engineer',
    skillIds: ['test-strategy', 'regression-analysis', 'api-testing', 'defect-analysis', 'release-readiness'],
    allowedToolIntents: ['workspace.context.read', 'workspace.memory.read', 'artifact.draft', 'test.sandbox.run'],
    maxIterations: 8,
    maxToolCalls: 8,
    systemAddendum: 'Use deterministic, non-destructive tests in a confirmed sandbox only. Do not control a personal browser, mutate shared environments, or perform non-test payment activity.'
  }
};

export function getHermesEmployeeContract(employeeId: string): HermesEmployeeContract | null {
  return HERMES_EMPLOYEE_CONTRACTS[employeeId as HermesEmployeeContract['employeeId']] || null;
}

export function buildHermesInstructions(employeeId: string, approvedSystemPrompt: string) {
  const contract = getHermesEmployeeContract(employeeId);
  if (!contract) throw new Error('Hermes is configured only for the four approved Caveworkers employees.');
  return `${approvedSystemPrompt}\n\nHermes execution policy:\n- Skills: ${contract.skillIds.join(', ')}\n- Allowed tool intents: ${contract.allowedToolIntents.join(', ')}\n- Max iterations: ${contract.maxIterations}\n- Max tool calls: ${contract.maxToolCalls}\n- ${contract.systemAddendum}\n- Caveworkers, not Hermes, is the authorization system. When a request would require approval, stop and return a structured recommendation; do not try a different tool or route.`;
}
