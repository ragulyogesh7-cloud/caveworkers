import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';
import { HermesCapability, HermesCapabilityIntent, verifyHermesCapability } from './hermes-capabilities.js';
import { evaluateHermesToolIntent } from './hermes-policy.js';

dotenv.config();

const port = Number(process.env.PORT || '8080') || 8080;
const bridgeToken = String(process.env.HERMES_MCP_BRIDGE_TOKEN || '').trim();
const signingKey = String(process.env.HERMES_CAPABILITY_SIGNING_KEY || '').trim();
const production = process.env.CAVEWORKERS_ENV === 'production';

if (production && (bridgeToken.length < 32 || signingKey.length < 32)) {
  throw new Error('The private Hermes bridge requires HERMES_MCP_BRIDGE_TOKEN and HERMES_CAPABILITY_SIGNING_KEY with at least 32 characters.');
}

const firebaseProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const firebaseClientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
const firebasePrivateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
if (!getApps().length) {
  if (firebaseProjectId && firebaseClientEmail && firebasePrivateKey) initializeApp({ credential: cert({ projectId: firebaseProjectId, clientEmail: firebaseClientEmail, privateKey: firebasePrivateKey }) });
  else initializeApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);
}
const firestore = getFirestore();
const consumedNonces = new Map<string, number>();

function constantTimeBearer(req: express.Request) {
  const candidate = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(bridgeToken && candidate.length === bridgeToken.length && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(bridgeToken)));
}

async function consumeNonce(capability: HermesCapability) {
  const ref = firestore.collection('hermes_capability_nonces').doc(capability.jti);
  return firestore.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return false;
    transaction.set(ref, { company_id: capability.company_id, employee_id: capability.employee_id, task_id: capability.task_id, intent: capability.intent, expires_at: new Date(capability.exp).toISOString(), consumed_at: new Date().toISOString() });
    return true;
  });
}

async function authorize(capabilityToken: string, intent: HermesCapabilityIntent) {
  if (!signingKey) throw new Error('Capability verification is not configured.');
  const encoded = String(capabilityToken || '');
  const [payloadText] = encoded.split('.');
  let unsafePayload: any;
  try { unsafePayload = JSON.parse(Buffer.from(payloadText || '', 'base64url').toString('utf8')); } catch { throw new Error('Malformed Hermes capability token.'); }
  const capability = verifyHermesCapability(encoded, signingKey, {
    company_id: String(unsafePayload?.company_id || ''),
    employee_id: String(unsafePayload?.employee_id || ''),
    task_id: Number(unsafePayload?.task_id),
    intent
  });
  const policy = evaluateHermesToolIntent({ companyId: capability.company_id, employeeId: capability.employee_id, taskId: capability.task_id, intent });
  if (policy.status !== 'allowed') throw new Error(policy.summary);
  if (!(await consumeNonce(capability))) throw new Error('This Hermes capability has already been used.');
  return capability;
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function errorText(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(message).slice(0, 500) }) }], isError: true };
}

function tenantCollection(companyId: string, collection: string) {
  return firestore.collection('tenants').doc(companyId).collection(collection);
}

export function createBridgeServer() {
  const server = new McpServer({ name: 'caveworkers-capability-bridge', version: '1.0.0' });

  server.registerTool('workspace_context_read', {
    description: 'Read the bounded, current-task context for the capability-bound employee. No other task or tenant may be accessed.',
    inputSchema: { capability_token: z.string().min(20).max(4096) }
  }, async ({ capability_token }) => {
    try {
      const capability = await authorize(capability_token, 'workspace.context.read');
      const snapshot = await tenantCollection(capability.company_id, 'tasks').doc(String(capability.task_id)).get();
      if (!snapshot?.exists) return text({ task_found: false, task_id: capability.task_id });
      const task = snapshot.data() || {};
      if (task.company_id && task.company_id !== capability.company_id) return errorText('Tenant scope mismatch.');
      return text({ task_found: true, task_id: capability.task_id, question: String(task.question || '').slice(0, 6000), status: String(task.status || '').slice(0, 80), plan: String(task.plan || '').slice(0, 4000), approved_context_only: true });
    } catch (error: any) { return errorText(error?.message || 'Context access denied.'); }
  });

  server.registerTool('employee_memory_read', {
    description: 'Read approved memory belonging only to the capability-bound tenant and employee.',
    inputSchema: { capability_token: z.string().min(20).max(4096) }
  }, async ({ capability_token }) => {
    try {
      const capability = await authorize(capability_token, 'workspace.memory.read');
      const snapshot = await tenantCollection(capability.company_id, 'employee_memory').where('employee_id', '==', capability.employee_id).limit(12).get();
      const memories = (snapshot?.docs || []).map((doc) => doc.data() || {}).map((memory: any) => ({ category: String(memory.category || '').slice(0, 80), content: String(memory.content || '').slice(0, 1600), created_at: String(memory.created_at || '').slice(0, 64) }));
      return text({ employee_id: capability.employee_id, memories });
    } catch (error: any) { return errorText(error?.message || 'Employee memory access denied.'); }
  });

  server.registerTool('artifact_draft', {
    description: 'Persist a bounded tenant-scoped draft artifact for Caveworkers review. This does not publish, send, or execute an external action.',
    inputSchema: { capability_token: z.string().min(20).max(4096), title: z.string().min(1).max(160), content: z.string().min(1).max(8000) }
  }, async ({ capability_token, title, content }) => {
    try {
      const capability = await authorize(capability_token, 'artifact.draft');
      const createdAt = new Date().toISOString();
      const artifactId = `hermes_${capability.task_id}_${capability.employee_id}_${capability.jti}`;
      await tenantCollection(capability.company_id, 'agent_artifacts').doc(artifactId).set({
        id: artifactId,
        company_id: capability.company_id,
        employee_id: capability.employee_id,
        task_id: capability.task_id,
        title,
        content,
        status: 'draft_only',
        source: 'hermes_capability_bridge',
        capability_nonce: capability.jti,
        created_at: createdAt,
        updated_at: createdAt
      });
      return text({ artifact: { id: artifactId, title, employee_id: capability.employee_id, task_id: capability.task_id, status: 'draft_only', persisted: true }, external_action_performed: false });
    } catch (error: any) { return errorText(error?.message || 'Artifact draft denied.'); }
  });

  server.registerTool('sandbox_test_request', {
    description: 'Prepare a QA sandbox-test request. The bridge never executes it; Caveworkers must record owner approval first.',
    inputSchema: { capability_token: z.string().min(20).max(4096), test_plan: z.string().min(1).max(6000), environment: z.literal('sandbox') }
  }, async ({ capability_token, test_plan, environment }) => {
    try {
      const capability = await authorize(capability_token, 'test.sandbox.run');
      const decision = evaluateHermesToolIntent({ companyId: capability.company_id, employeeId: capability.employee_id, taskId: capability.task_id, intent: 'test.sandbox.run', environment });
      return text({ status: decision.status, code: decision.code, summary: decision.summary, test_plan, external_action_performed: false });
    } catch (error: any) { return errorText(error?.message || 'Sandbox test request denied.'); }
  });
  return server;
}

export function createBridgeApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb', type: ['application/json', 'application/*+json'] }));
  app.use('/mcp', (req, res, next) => constantTimeBearer(req) ? next() : res.status(401).json({ error: 'Bridge authentication failed.' }));
  app.post('/mcp', async (req, res) => {
    const server = createBridgeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => { void transport.close(); void server.close(); });
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Bridge request failed.' }, id: null });
    }
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'healthy', bridge: 'caveworkers-capability-bridge' }));
  return app;
}

export function startBridgeServer() {
  return createBridgeApp().listen(port, '0.0.0.0', () => console.log(`Caveworkers Hermes capability bridge listening on ${port}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startBridgeServer();
