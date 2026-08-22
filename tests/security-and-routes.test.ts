import crypto from 'crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTrialExpired, verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from '../security.js';
import { GOLDEN_TASK_CASES } from './golden-task-fixtures.js';

process.env.NODE_ENV = 'test';
process.env.SENTRY_DSN = '';
process.env.VITEST = 'true';
process.env.ALWAYS_ON_WORKER_ENABLED = 'false';
process.env.RAZORPAY_KEY_SECRET = 'payment_test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_test_secret';
process.env.MCP_TOKEN_ENCRYPTION_KEY = 'mcp_test_encryption_key';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';

const { app, db, pendingPaymentOrders, workforceTestHooks } = await import('../server.js');
const now = new Date().toISOString();

const FOUR_EMPLOYEES = [
  { id: 'data_analyst', name: 'Data Analyst', role: 'Data Analyst', department: 'Data & Business Intelligence' },
  { id: 'cybersecurity_analyst', name: 'Cybersecurity Analyst', role: 'Cybersecurity Analyst', department: 'Security & Compliance' },
  { id: 'backend_developer', name: 'Full Stack Backend Developer', role: 'Full Stack Backend Developer', department: 'Engineering & Architecture' },
  { id: 'qa_engineer', name: 'Software QA/Automation Engineer', role: 'Software QA/Automation Engineer', department: 'Quality Assurance & Reliability' }
];

function workforceRoster() {
  return FOUR_EMPLOYEES.map((employee) => ({ ...employee, status: 'active', tools: [], permissions: [], autonomy_mode: 'autopilot', high_impact_action_policy: 'review' }));
}

function seedTenants() {
  db.users.clear();
  db.companies.clear();
  db.orgEmployees.clear();
  db.tasks.clear();
  db.approvals.clear();
  db.taskTenantsLoaded.clear();
  db.approvalTenantsLoaded.clear();
  db.activityLoaded.clear();
  db.analystApprovalsLoaded.clear();
  db.analystMemory.clear();
  db.analystRuns.clear();
  db.knowledge.clear();
  db.activity.clear();
  db.audit.clear();
  db.usage.clear();
  db.activationEvents.clear();
  db.scheduledWorkflows.clear();
  db.dataExports.clear();
  db.deletionRequests.clear();
  db.mcpConnections.clear();
  db.workforceQueue.clear();
  db.employeePresence.clear();
  db.employeePlans.clear();
  db.employeeMemory.clear();
  db.conversations.clear();
  pendingPaymentOrders.clear();
  workforceTestHooks?.resetRateLimits();

  db.users.set('user-a', { uid: 'user-a', email: 'a@example.com', display_name: 'Tenant A Owner', company_id: 'company-a', company_name: 'Tenant A', onboarded: true, selected_tier: 'growth', role: 'admin' });
  db.users.set('user-b', { uid: 'user-b', email: 'b@example.com', display_name: 'Tenant B Owner', company_id: 'company-b', company_name: 'Tenant B', onboarded: true, selected_tier: 'growth', role: 'admin' });
  db.users.set('user-a-member', { uid: 'user-a-member', email: 'member@example.com', display_name: 'Tenant A Member', company_id: 'company-a', company_name: 'Tenant A', onboarded: true, selected_tier: 'growth', role: 'member' });
  db.companies.set('company-a', { id: 'company-a', name: 'Tenant A', tier: 'growth', status: 'active', owner_uid: 'user-a', created_at: now });
  db.companies.set('company-b', { id: 'company-b', name: 'Tenant B', tier: 'growth', status: 'active', owner_uid: 'user-b', created_at: now });
  db.orgEmployees.set('company-a', workforceRoster());
  db.orgEmployees.set('company-b', workforceRoster());
  db.taskTenantsLoaded.add('company-a');
  db.taskTenantsLoaded.add('company-b');
}

function csrfRequest(userId: string, method: 'post' | 'put' | 'patch' | 'delete', path: string) {
  const token = `csrf-token-${userId}`;
  return request(app)[method](path).set('x-caveworkers-test-user', userId).set('x-csrf-token', token).set('Cookie', [`cw_csrf=${token}`]);
}

const planSections = {
  responsibilities: ['Own the defined, evidence-based role outcomes.'],
  skill_boundaries: ['Escalate work outside the approved remit.'],
  tool_boundaries: ['Use only assigned tools and never perform unapproved writes.'],
  voice_persona: ['Concise, clear, and explicit about uncertainty.'],
  model_strategy: ['Use the configured OpenRouter primary model and fallback.'],
  prompting: ['Use role context and only tenant-approved information.'],
  memory_policy: ['Retain only approved tenant-scoped role memory.'],
  evaluation_cases: ['Refuse unsafe actions and request missing evidence.'],
  approval_rules: ['Prepare recommendations; require explicit owner approval for external actions and payments.']
};

async function approvePlan(employeeId: string) {
  await csrfRequest('user-a', 'post', `/api/employees/${employeeId}/prebuild-plan`).send({ sections: planSections }).expect(201);
  await csrfRequest('user-a', 'post', `/api/employees/${employeeId}/prebuild-plan/decision`).send({ decision: 'approved' }).expect(200);
}

afterEach(() => vi.restoreAllMocks());

describe('Caveworkers current workforce and billing invariants', () => {
  beforeEach(() => seedTenants());

  it('verifies Razorpay signatures and rejects tampering', () => {
    const signature = crypto.createHmac('sha256', 'payment_test_secret').update('order_test_123|pay_test_123').digest('hex');
    expect(verifyRazorpayPaymentSignature('order_test_123', 'pay_test_123', signature, 'payment_test_secret')).toBe(true);
    expect(verifyRazorpayPaymentSignature('order_test_123', 'pay_tampered', signature, 'payment_test_secret')).toBe(false);
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const webhookSignature = crypto.createHmac('sha256', 'webhook_test_secret').update(body).digest('hex');
    expect(verifyRazorpayWebhookSignature(body, webhookSignature, 'webhook_test_secret')).toBe(true);
    expect(verifyRazorpayWebhookSignature(Buffer.from(`${body.toString()} `), webhookSignature, 'webhook_test_secret')).toBe(false);
  });

  it('requires explicit owner checkout context before creating a Razorpay order and validates amount after that gate', async () => {
    await csrfRequest('guest-user', 'post', '/api/create-order').send({ tier: 'growth', approval_context: 'owner_checkout' }).expect(401);
    await csrfRequest('user-a', 'post', '/api/create-order').send({ tier: 'growth' }).expect(403);
    await csrfRequest('user-a', 'post', '/api/create-order').send({ amount: 50, approval_context: 'owner_checkout' }).expect(400);

    const orderId = 'order_valid_999';
    const paymentId = 'pay_valid_999';
    const validSignature = crypto.createHmac('sha256', 'payment_test_secret').update(`${orderId}|${paymentId}`).digest('hex');
    pendingPaymentOrders.set(orderId, { uid: 'user-a', company_id: 'company-a', tier: 'enterprise', amount: 1500, created_at: now });
    const verified = await csrfRequest('user-a', 'post', '/api/verify-payment').send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: validSignature }).expect(200);
    expect(verified.body).toMatchObject({ success: true, status: 'verified', tier: 'enterprise' });
    expect(db.companies.get('company-a')?.tier).toBe('enterprise');
  });

  it('exposes billing for the four-avatar workforce and enforces the configured monthly task quota', async () => {
    const billing = await request(app).get('/api/billing').set('x-caveworkers-test-user', 'user-a').expect(200);
    expect(billing.body).toMatchObject({ tier_key: 'growth', active_employees: 4, max_employees: 4, quota_remaining: 0, legacy_overage: false, enrollment_locked: true });
    expect(billing.body.available_plans).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'growth' }), expect.objectContaining({ key: 'enterprise' })]));

    const period = new Date().toISOString().slice(0, 7);
    db.companies.set('company-a', { id: 'company-a', name: 'Tenant A', tier: 'free_trial', status: 'active', owner_uid: 'user-a', created_at: now });
    db.usage.set(`company-a:${period}`, { company_id: 'company-a', period, tasks_created: 50, tasks_completed: 0, tool_calls: 0, external_actions: 0, estimated_tokens: 0, updated_at: now });
    const quota = await csrfRequest('user-a', 'post', '/api/tasks').send({ request: 'Reject this task at the monthly limit.' }).expect(402);
    expect(quota.body).toMatchObject({ code: 'task_quota_exceeded', limit: 50, usage: { tasks_created: 50 } });
    expect(isTrialExpired('free_trial', new Date(Date.now() - 1_000).toISOString())).toBe(true);
  });

  it('routes current golden tasks only to active four-avatar workforce roles without leaking private traces', async () => {
    for (const fixture of GOLDEN_TASK_CASES) {
      const result = await workforceTestHooks!.handleTaskRoutingAsync(fixture.prompt, 'company-a');
      expect(result.company_id, fixture.id).toBe('company-a');
      expect(result.participants, fixture.id).toEqual(expect.arrayContaining(['Manager', fixture.expected_name]));
      expect(result.trace, fixture.id).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'internal_reasoning' })]));
      expect(result.participants.every((participant: string) => participant === 'Manager' || FOUR_EMPLOYEES.some((employee) => employee.name === participant)), fixture.id).toBe(true);
    }
  });

  it('reports only the current four safe capability summaries in the owner workforce view', async () => {
    const workroom = await request(app).get('/api/workforce/workroom').set('x-caveworkers-test-user', 'user-a').expect(200);
    expect(workroom.body.employees.map((employee: any) => employee.id)).toEqual(FOUR_EMPLOYEES.map((employee) => employee.id));
    expect(workroom.body.employees).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'data_analyst', capability_summary: expect.stringContaining('evidence-first') }),
      expect.objectContaining({ id: 'cybersecurity_analyst', capability_summary: expect.stringContaining('least-privilege') }),
      expect.objectContaining({ id: 'backend_developer', capability_summary: expect.stringContaining('migration') }),
      expect.objectContaining({ id: 'qa_engineer', capability_summary: expect.stringContaining('test strategy') })
    ]));
    expect(workroom.body.employees.every((employee: any) => employee.system_prompt === undefined)).toBe(true);
  });

  it('keeps detailed plans, memories, conversations, and task execution isolated to the current tenant and employee workspace', async () => {
    await csrfRequest('user-a', 'post', '/api/employees/data_analyst/prebuild-plan').send({ sections: planSections }).expect(201);
    await request(app).get('/api/employees/data_analyst/prebuild-plan').set('x-caveworkers-test-user', 'user-b').expect(200).then((response) => expect(response.body.plan).toBeNull());
    await csrfRequest('user-a', 'post', '/api/employees/data_analyst/conversation').send({ message: 'Review this metric variance.' }).expect(409);
    await csrfRequest('user-a', 'post', '/api/employees/data_analyst/prebuild-plan/decision').send({ decision: 'approved' }).expect(200);
    await csrfRequest('user-a', 'post', '/api/employees/data_analyst/conversation').send({ message: 'Review this metric variance.' }).expect(200).then((response) => expect(response.body.messages[2]?.body).toContain('evidence-first analysis'));
    await request(app).get('/api/employees/data_analyst/conversation').set('x-caveworkers-test-user', 'user-b').expect(200).then((response) => {
      expect(response.body.messages.some((message: any) => message.sender === 'manager')).toBe(false);
      expect(response.body.messages.some((message: any) => String(message.body).includes('Review this metric variance.'))).toBe(false);
    });

    await csrfRequest('user-a', 'post', '/api/employees/data_analyst/memory').send({ category: 'playbook', content: 'Use the fiscal year agreed by the owner.' }).expect(201);
    await request(app).get('/api/employees/data_analyst/profile').set('x-caveworkers-test-user', 'user-b').expect(200).then((response) => expect(response.body.memory).toHaveLength(0));

    await csrfRequest('user-a', 'post', '/api/tasks').send({ request: 'Review this metric variance.', preferred_employee_id: 'data_analyst' }).expect(202);
    await request(app).get('/api/tasks').set('x-caveworkers-test-user', 'user-b').expect(200).then((response) => expect(response.body.tasks).toHaveLength(0));
  });

  it('keeps each role-specific workspace disabled until its own plan is approved', async () => {
    for (const employee of FOUR_EMPLOYEES) {
      await csrfRequest('user-a', 'post', `/api/employees/${employee.id}/conversation`).send({ message: `Prepare the approved ${employee.role} work.` }).expect(409);
      await approvePlan(employee.id);
      await csrfRequest('user-a', 'post', `/api/employees/${employee.id}/conversation`).send({ message: `Prepare the approved ${employee.role} work.` }).expect(200);
    }
  });

  it('keeps Security, Backend, and QA write-capable tools review-gated even when autopilot is requested', async () => {
    for (const [index, employeeId] of ['cybersecurity_analyst', 'backend_developer', 'qa_engineer'].entries()) {
      const toolName = index === 0 ? 'identity.role.update' : index === 1 ? 'github.commit.create' : 'test.shared_environment.run';
      db.mcpConnections.set(`company-a:${employeeId}`, [{ id: index + 40, company_id: 'company-a', employee_id: employeeId, name: 'Guarded connector', connection_type: 'streamable_http', status: 'connected', autonomy_mode: 'autopilot', config: {}, discovered_tools: [{ name: toolName, description: 'Write-capable action' }], tool_grants: [], created_at: now, updated_at: now }]);
      const policy = await csrfRequest('user-a', 'patch', `/api/employees/${employeeId}/autonomy`).send({ autonomy_mode: 'autopilot', high_impact_action_policy: 'autopilot' }).expect(200);
      expect(policy.body.employee.high_impact_action_policy).toBe('review');
      const connection = await csrfRequest('user-a', 'patch', `/api/employees/${employeeId}/mcp-connections/${index + 40}/autonomy`).send({ autonomy_mode: 'autopilot', tool_name: toolName, access_level: 'read_write' }).expect(200);
      expect(connection.body.connection.autonomy_mode).toBe('copilot');
      expect(connection.body.connection.tool_grants).toEqual(expect.arrayContaining([expect.objectContaining({ tool_name: toolName, access_level: 'requires_approval' })]));
    }
  });

  it('blocks expired free-trial work before queuing a task', async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    db.companies.set('company-a', { id: 'company-a', name: 'Tenant A', tier: 'free_trial', status: 'active', owner_uid: 'user-a', created_at: now, trial_ends_at: expired });
    const response = await csrfRequest('user-a', 'post', '/api/tasks').send({ request: 'Run a safe review.' }).expect(402);
    expect(response.body).toMatchObject({ upgrade_required: true, trial_ends_at: expired });
  });
});
