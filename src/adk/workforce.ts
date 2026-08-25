import { Content } from '@google/genai';
import { FunctionTool, InMemoryRunner, LlmAgent, isFinalResponse } from '@google/adk';

export type AdkEmployeeId = 'data_analyst' | 'cybersecurity_analyst' | 'backend_developer' | 'qa_engineer';
export type PermissionDecision = 'ALLOW' | 'DENY' | 'APPROVAL_REQUIRED';
export type AdkEnvironment = 'development' | 'staging' | 'production';

export interface PermissionResult {
  decision: PermissionDecision;
  employee_id: string;
  capability: string;
  environment: AdkEnvironment;
  reason: string;
}

export interface AdkEmployeeDefinition {
  id: AdkEmployeeId;
  name: string;
  role: string;
  mission: string;
  skills: string[];
  allowedCapabilities: string[];
  approvalCapabilities: string[];
  forbiddenCapabilities: string[];
  instruction: string;
  model: string;
}

export interface AdkToolExecutionRequest {
  companyId: string;
  userId?: string;
  taskId?: number;
  employeeId: AdkEmployeeId;
  capability: string;
  repository: string;
  path?: string;
  ref?: string;
  query?: string;
}

export interface AdkToolExecutionResult {
  status: 'executed' | 'blocked' | 'failed';
  summary: string;
  evidence?: Record<string, string>;
}

export type AdkToolExecutor = (request: AdkToolExecutionRequest) => Promise<AdkToolExecutionResult>;

const MODEL = (process.env.ADK_MODEL || 'gemini-2.5-flash').trim();

const roleGuardrails = `You are operating inside Caveworkers, a multi-tenant workforce platform. Treat all workspace data as tenant-scoped. Never request, reveal, infer, or retain credentials, tokens, secrets, or data belonging to another company. Distinguish verified evidence from assumptions. Do not claim a tool call, file change, external write, deployment, issue, pull request, payment, or release happened unless the platform provides explicit execution evidence. If an action is not in your capability contract, explain the boundary and request human approval when the policy says approval is required.`;

export const ADK_EMPLOYEE_DEFINITIONS: readonly AdkEmployeeDefinition[] = [
  {
    id: 'data_analyst',
    name: 'Maya',
    role: 'Data Analyst',
    mission: 'Produce evidence-first metrics, anomaly findings, dashboards, and decision briefs from company data.',
    skills: ['SQL analysis', 'Python and Pandas analysis', 'KPI calculation', 'anomaly detection', 'data validation', 'report and visualization drafting'],
    allowedCapabilities: ['analytics.db.read', 'analytics.files.read', 'python.execute', 'report.draft', 'visualization.draft', 'workspace.memory.read'],
    approvalCapabilities: ['report.export', 'external.data.write'],
    forbiddenCapabilities: ['production.database.write', 'production.deploy', 'billing.modify', 'user.delete', 'cross_tenant.data.read'],
    instruction: `${roleGuardrails}\n\nYou are Maya, the Data Analyst. Your mission is to produce clear calculations, assumptions, limitations, anomalies, and next actions. Prefer read-only analysis and reproducible methodology. You may draft reports and visualizations, but never turn a draft into an external or production write without the platform decision.`,
    model: MODEL
  },
  {
    id: 'cybersecurity_analyst',
    name: 'Iris',
    role: 'Cybersecurity Analyst',
    mission: 'Protect the company through least-privilege defensive vulnerability, access, configuration, log, and compliance analysis.',
    skills: ['vulnerability assessment', 'dependency analysis', 'log analysis', 'configuration review', 'threat analysis', 'security reporting'],
    allowedCapabilities: ['repository.read', 'security_scanner.read', 'dependency_scanner.read', 'logs.read', 'infrastructure.metadata.read', 'security.finding.draft', 'workspace.memory.read'],
    approvalCapabilities: ['github.issue.create', 'security.finding.publish'],
    forbiddenCapabilities: ['destructive.scan', 'offensive.exploit', 'production.change', 'privilege.elevation', 'cross_tenant.data.read', 'billing.modify'],
    instruction: `${roleGuardrails}\n\nYou are Iris, the Cybersecurity Analyst. Work defensively and least-privilege first. Classify severity and scope, separate evidence from hypotheses, identify missing evidence, recommend reversible mitigations, and escalate production changes, destructive scans, privilege changes, and external issue writes through the platform policy.`,
    model: MODEL
  },
  {
    id: 'backend_developer',
    name: 'Arav',
    role: 'Full Stack Backend Developer',
    mission: 'Inspect, design, and improve application code, APIs, database migrations, development workflows, and cloud architecture.',
    skills: ['repository analysis', 'TypeScript and Node.js', 'Python', 'API design', 'SQL and schema design', 'testing', 'CI/CD'],
    allowedCapabilities: ['repository.read', 'issues.read', 'devdb.read', 'devdb.write', 'terminal.sandbox.execute', 'branch.create', 'commit.create', 'test.run', 'workspace.memory.read'],
    approvalCapabilities: ['pull_request.create', 'protected_branch.merge', 'production.database.write', 'production.deploy', 'ci.release.trigger'],
    forbiddenCapabilities: ['billing.modify', 'user.delete', 'repository.delete', 'cross_tenant.data.read', 'production.secret.read'],
    instruction: `${roleGuardrails}\n\nYou are Arav, the Full Stack Backend Developer. Start with affected components and a smallest reversible change. When the tenant-gated GitHub repository-read tool is available, use it for repository evidence before proposing code changes. Design validation, authorization, idempotency, error handling, observability, rollback, and verification. Development work may be prepared within the capability boundary; protected branch merges, production writes, deployments, and releases always require a separate platform approval.`,
    model: MODEL
  },
  {
    id: 'qa_engineer',
    name: 'Priya',
    role: 'Software QA/Automation Engineer',
    mission: 'Provide reliable test strategy, unit, integration, API, browser, regression, reproduction, and release-validation evidence.',
    skills: ['unit testing', 'integration testing', 'API testing', 'browser automation', 'regression analysis', 'bug reproduction', 'release validation'],
    allowedCapabilities: ['repository.read', 'test.run', 'testdb.read', 'test.write', 'test.report.write', 'browser.test.execute', 'issue.draft', 'workspace.memory.read'],
    approvalCapabilities: ['github.issue.create', 'release.validation.publish'],
    forbiddenCapabilities: ['production.write', 'destructive.test', 'production.deploy', 'billing.modify', 'user.delete', 'cross_tenant.data.read'],
    instruction: `${roleGuardrails}\n\nYou are Priya, the QA Automation Engineer. Identify the system under test, revision, expected behavior, critical journey, evidence, and approval needs. Cover happy path, validation, authorization, failure, edge, regression, and compatibility risks. Use isolated, deterministic, non-destructive paths and label conclusions as verified result, observation, defect, or release recommendation.`,
    model: MODEL
  }
];

const definitionById = new Map(ADK_EMPLOYEE_DEFINITIONS.map((definition) => [definition.id, definition]));

export function getAdkEmployeeDefinition(employeeId: string): AdkEmployeeDefinition | undefined {
  return definitionById.get(String(employeeId || '').trim().toLowerCase() as AdkEmployeeId);
}

export function evaluateAdkPermission(employeeId: string, capability: string, environment: AdkEnvironment = 'development'): PermissionResult {
  const definition = getAdkEmployeeDefinition(employeeId);
  const normalizedCapability = String(capability || '').trim().toLowerCase();
  const normalizedEnvironment = environment || 'development';
  if (!definition) {
    return { decision: 'DENY', employee_id: String(employeeId || 'unknown'), capability: normalizedCapability, environment: normalizedEnvironment, reason: 'Unknown employee identity.' };
  }
  const base = { employee_id: definition.id, capability: normalizedCapability, environment: normalizedEnvironment };
  if (!normalizedCapability) return { ...base, decision: 'DENY', reason: 'A capability is required.' };
  if (definition.forbiddenCapabilities.includes(normalizedCapability) || normalizedCapability.startsWith('cross_tenant.')) {
    return { ...base, decision: 'DENY', reason: 'The capability is forbidden by the employee authority boundary.' };
  }
  if (normalizedEnvironment === 'production' && (normalizedCapability.includes('.write') || normalizedCapability.includes('.deploy') || normalizedCapability.includes('.merge') || normalizedCapability.includes('release'))) {
    return { ...base, decision: 'APPROVAL_REQUIRED', reason: 'Production mutations require explicit human approval.' };
  }
  if (definition.approvalCapabilities.includes(normalizedCapability)) {
    return { ...base, decision: 'APPROVAL_REQUIRED', reason: 'This capability requires a recorded manager approval before execution.' };
  }
  if (definition.allowedCapabilities.includes(normalizedCapability)) {
    return { ...base, decision: 'ALLOW', reason: 'The capability is allowed for this employee and environment.' };
  }
  return { ...base, decision: 'DENY', reason: 'The capability is not present in the employee allow-list.' };
}

const capabilityCheckSchema = {
  type: 'OBJECT',
  properties: {
    capability: { type: 'STRING', description: 'The Caveworkers capability name to check.' },
    environment: { type: 'STRING', enum: ['development', 'staging', 'production'], description: 'Execution environment.' }
  },
  required: ['capability']
} as any;

type CapabilityCheckInput = { capability: string; environment?: AdkEnvironment };

function permissionTool(employeeId: AdkEmployeeId) {
  return new FunctionTool({
    name: 'check_caveworkers_permission',
    description: 'Ask the Caveworkers permission engine whether a named capability is allowed, denied, or requires human approval. This check never executes the external action.',
    parameters: capabilityCheckSchema,
    execute: (input: CapabilityCheckInput) => evaluateAdkPermission(employeeId, input.capability, input.environment)
  });
}

const githubReadSchema = {
  type: 'OBJECT',
  properties: {
    repository: { type: 'STRING', description: 'GitHub repository in owner/name form or a GitHub URL.' },
    path: { type: 'STRING', description: 'Optional file or directory path within the repository.' },
    ref: { type: 'STRING', description: 'Optional branch, tag, or commit ref.' },
    query: { type: 'STRING', description: 'Optional bounded search request for repository context.' }
  },
  required: ['repository']
} as any;

type GithubReadInput = { repository: string; path?: string; ref?: string; query?: string };

function githubReadTool(employeeId: AdkEmployeeId, executor: AdkToolExecutor, userId?: string, taskId?: number) {
  return new FunctionTool({
    name: 'read_github_repository',
    description: 'Read tenant-authorized GitHub repository context through the Caveworkers tool gateway. This tool is read-only and cannot create branches, commits, pull requests, or issues.',
    parameters: githubReadSchema,
    execute: (input: GithubReadInput) => executor({ companyId: '', userId, taskId, employeeId, capability: 'repository.read', ...input })
  });
}

export interface AdkAgentTree {
  manager: LlmAgent;
  employees: Record<AdkEmployeeId, LlmAgent>;
}

export function createAdkAgentTree(executor?: AdkToolExecutor, userId?: string, taskId?: number): AdkAgentTree {
  const agents = ADK_EMPLOYEE_DEFINITIONS.map((definition) => {
    const tools = [permissionTool(definition.id)];
    if ((definition.id === 'backend_developer' || definition.id === 'qa_engineer') && executor) tools.push(githubReadTool(definition.id, executor, userId, taskId));
    return new LlmAgent({
      name: definition.id,
      description: `${definition.role}: ${definition.mission}`,
      model: definition.model,
      instruction: definition.instruction,
      tools
    });
  });
  const employees = Object.fromEntries(agents.map((agent, index) => [ADK_EMPLOYEE_DEFINITIONS[index].id, agent])) as Record<AdkEmployeeId, LlmAgent>;
  const manager = new LlmAgent({
    name: 'caveworkers_manager',
    description: 'Central Caveworkers workforce orchestrator and delivery manager.',
    model: MODEL,
    instruction: `${roleGuardrails}\n\nYou are the Caveworkers Manager and central orchestrator. Receive the user objective, workspace context, current evidence, active employee roster, and capability boundaries. Decide which specialist should work, what each specialist should contribute, dependencies and order, when to ask another specialist, and when to escalate. Delegate to the specialized employee agents instead of pretending to do their work. When Arav has the tenant-gated GitHub read tool, use it for repository evidence before any engineering recommendation. Synthesize only evidence returned in the current task. Return a concise workplace update with: answer or blocker first, verified findings, contributors, risks or missing evidence, and the next action. Never authorize or claim production changes.\n\nEmployee contracts:\n${ADK_EMPLOYEE_DEFINITIONS.map((definition) => `- ${definition.name} (${definition.id}): ${definition.mission}`).join('\n')}`,
    subAgents: agents
  });
  return { manager, employees };
}

const defaultAgentTree = createAdkAgentTree();
export const ADK_EMPLOYEE_AGENTS = defaultAgentTree.employees;
export const ADK_MANAGER_AGENT = defaultAgentTree.manager;

export interface AdkWorkforceInput {
  companyId: string;
  userId?: string;
  taskId?: number;
  preferredEmployeeId?: string;
  prompt: string;
  toolExecutor?: AdkToolExecutor;
}

export interface AdkWorkforceResult {
  status: 'completed' | 'disabled' | 'failed';
  text: string;
  model: string;
  latencyMs: number;
  events: Array<{ author?: string; final: boolean; text?: string }>;
  error?: string;
}

function adkConfigured(): boolean {
  if (!process.env.GOOGLE_GENAI_API_KEY && process.env.GEMINI_API_KEY) process.env.GOOGLE_GENAI_API_KEY = process.env.GEMINI_API_KEY;
  return Boolean(process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GENAI_USE_VERTEXAI === '1');
}

function textFromEvent(event: any): string {
  return Array.isArray(event?.content?.parts) ? event.content.parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('').trim() : '';
}

export async function runAdkWorkforce(input: AdkWorkforceInput): Promise<AdkWorkforceResult> {
  const startedAt = Date.now();
  if (!adkConfigured()) return { status: 'disabled', text: '', model: MODEL, latencyMs: 0, events: [] };
  const context = [
    `Tenant: ${input.companyId}`,
    `Task: ${input.taskId || 'conversation'}`,
    `Preferred specialist: ${getAdkEmployeeDefinition(input.preferredEmployeeId || '')?.name || 'Manager decides'}`,
    'The platform has already redacted credentials and tenant-sensitive values from this prompt.',
    input.prompt
  ].join('\n\n');
  try {
    const tree = createAdkAgentTree(input.toolExecutor ? async (request) => input.toolExecutor!({ ...request, companyId: input.companyId }) : undefined, input.userId, input.taskId);
    const runner = new InMemoryRunner({ agent: tree.manager, appName: 'caveworkers-adk-workforce' });
    const events: Array<{ author?: string; final: boolean; text?: string }> = [];
    for await (const event of runner.runEphemeral({
      userId: input.userId || 'workspace-manager',
      newMessage: { role: 'user', parts: [{ text: context }] } as Content
    })) {
      const text = textFromEvent(event);
      events.push({ author: event.author, final: isFinalResponse(event), text: text || undefined });
    }
    const finalText = events.filter((event) => event.final && event.text).map((event) => event.text).filter(Boolean).pop() || events.map((event) => event.text).filter(Boolean).pop() || '';
    if (!finalText) return { status: 'failed', text: '', model: MODEL, latencyMs: Date.now() - startedAt, events, error: 'ADK returned no manager response.' };
    return { status: 'completed', text: finalText, model: MODEL, latencyMs: Date.now() - startedAt, events };
  } catch (error: any) {
    return { status: 'failed', text: '', model: MODEL, latencyMs: Date.now() - startedAt, events: [], error: String(error?.message || 'ADK workforce execution failed.').slice(0, 500) };
  }
}

export interface AdkEngineeringQualityResult extends AdkWorkforceResult {
  stages: Array<{ employeeId: 'backend_developer' | 'qa_engineer' | 'caveworkers_manager'; status: 'completed' | 'failed'; text?: string; error?: string }>;
}

async function runSingleAdkAgent(agent: LlmAgent, userId: string, prompt: string): Promise<{ status: 'completed' | 'failed'; text: string; events: Array<{ author?: string; final: boolean; text?: string }>; error?: string }> {
  const events: Array<{ author?: string; final: boolean; text?: string }> = [];
  try {
    const runner = new InMemoryRunner({ agent, appName: 'caveworkers-adk-workforce' });
    for await (const event of runner.runEphemeral({ userId, newMessage: { role: 'user', parts: [{ text: prompt }] } as Content })) {
      const text = textFromEvent(event);
      events.push({ author: event.author, final: isFinalResponse(event), text: text || undefined });
    }
    const text = events.filter((event) => event.final && event.text).map((event) => event.text).filter(Boolean).pop() || events.map((event) => event.text).filter(Boolean).pop() || '';
    return text ? { status: 'completed', text, events } : { status: 'failed', text: '', events, error: 'ADK agent returned no response.' };
  } catch (error: any) {
    return { status: 'failed', text: '', events, error: String(error?.message || 'ADK agent execution failed.').slice(0, 500) };
  }
}

export async function runAdkEngineeringQualityWorkflow(input: AdkWorkforceInput): Promise<AdkEngineeringQualityResult> {
  const startedAt = Date.now();
  if (!adkConfigured()) return { status: 'disabled', text: '', model: MODEL, latencyMs: 0, events: [], stages: [] };
  const tree = createAdkAgentTree(input.toolExecutor ? async (request) => input.toolExecutor!({ ...request, companyId: input.companyId }) : undefined, input.userId, input.taskId);
  const userId = input.userId || 'workspace-manager';
  const backendPrompt = [
    `Tenant: ${input.companyId}`,
    `Task: ${input.taskId || 'engineering-quality-workflow'}`,
    'You are the first stage. Analyze the engineering request, inspect the tenant-authorized GitHub repository if a read tool is available, and return an implementation diagnosis, affected components, proposed change, risks, and verification plan. Do not claim a code change happened.',
    input.prompt
  ].join('\n\n');
  const backend = await runSingleAdkAgent(tree.employees.backend_developer, userId, backendPrompt);
  const qaPrompt = [
    `Tenant: ${input.companyId}`,
    `Task: ${input.taskId || 'engineering-quality-workflow'}`,
    'You are the second stage. Review the Backend Developer finding below, inspect the same tenant-authorized repository if a read tool is available, and produce deterministic QA coverage, reproduction steps, expected evidence, and a pass/fail/retest recommendation. Do not claim tests ran unless execution evidence is present.',
    `Original request:\n${input.prompt}`,
    `Backend finding:\n${backend.text || backend.error || 'Backend stage failed before producing a finding.'}`
  ].join('\n\n');
  const qa = await runSingleAdkAgent(tree.employees.qa_engineer, userId, qaPrompt);
  const managerPrompt = [
    `Tenant: ${input.companyId}`,
    `Task: ${input.taskId || 'engineering-quality-workflow'}`,
    'You are the final Caveworkers Manager stage. Synthesize the Backend Developer and QA Automation Engineer findings. If QA identified a failure, state the exact retest or backend revision needed. If evidence is only a plan or observation, label it that way. Return a concise workplace update with answer/blocker first, verified evidence, contributors, risks, and next action. Never claim code changes, tests, commits, pull requests, deployments, or releases without explicit tool evidence.',
    `Original request:\n${input.prompt}`,
    `Backend stage:\n${backend.text || backend.error || 'failed'}`,
    `QA stage:\n${qa.text || qa.error || 'failed'}`
  ].join('\n\n');
  const manager = await runSingleAdkAgent(tree.manager, userId, managerPrompt);
  const events = [...backend.events, ...qa.events, ...manager.events];
  const stages: AdkEngineeringQualityResult['stages'] = [
    { employeeId: 'backend_developer', status: backend.status, text: backend.text || undefined, error: backend.error },
    { employeeId: 'qa_engineer', status: qa.status, text: qa.text || undefined, error: qa.error },
    { employeeId: 'caveworkers_manager', status: manager.status, text: manager.text || undefined, error: manager.error }
  ];
  if (manager.status !== 'completed') return { status: 'failed', text: '', model: MODEL, latencyMs: Date.now() - startedAt, events, stages, error: manager.error || 'Manager synthesis failed.' };
  return { status: 'completed', text: manager.text, model: MODEL, latencyMs: Date.now() - startedAt, events, stages };
}
