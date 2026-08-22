import crypto from 'crypto';

export type HermesCapabilityIntent = 'workspace.context.read' | 'workspace.memory.read' | 'artifact.draft' | 'test.sandbox.run';

export type HermesCapability = {
  v: 1;
  jti: string;
  company_id: string;
  employee_id: string;
  task_id: number;
  intent: HermesCapabilityIntent;
  exp: number;
};

export type CapabilityScope = Pick<HermesCapability, 'company_id' | 'employee_id' | 'task_id' | 'intent'>;
export type CapabilityBaseScope = Omit<CapabilityScope, 'intent'>;

function sign(encodedPayload: string, signingKey: string) {
  return crypto.createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');
}

function isSafeScope(value: string, maxLength: number) {
  return /^[A-Za-z0-9:_-]{1,}$/.test(value) && value.length <= maxLength;
}

export function createHermesCapability(scope: CapabilityScope, signingKey: string, ttlMs = 120_000, now = Date.now()) {
  if (!signingKey || signingKey.length < 32) throw new Error('HERMES_CAPABILITY_SIGNING_KEY must be at least 32 characters.');
  if (!isSafeScope(scope.company_id, 160) || !isSafeScope(scope.employee_id, 80) || !Number.isSafeInteger(scope.task_id) || scope.task_id < 1) throw new Error('Invalid Hermes capability scope.');
  const payload: HermesCapability = {
    v: 1,
    jti: crypto.randomUUID(),
    company_id: scope.company_id,
    employee_id: scope.employee_id,
    task_id: scope.task_id,
    intent: scope.intent,
    exp: now + Math.min(Math.max(ttlMs, 5_000), 300_000)
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, signingKey)}`;
}

export function createHermesCapabilityBundle(scope: CapabilityBaseScope, intents: HermesCapabilityIntent[], signingKey: string, ttlMs = 120_000, now = Date.now()) {
  const bundle: Partial<Record<HermesCapabilityIntent, string>> = {};
  for (const intent of [...new Set(intents)]) bundle[intent] = createHermesCapability({ ...scope, intent }, signingKey, ttlMs, now);
  return bundle;
}

export function redactHermesCapabilityTokens(value: string, tokens: string[]) {
  let redacted = String(value || '');
  for (const token of tokens) redacted = redacted.split(token).join('[redacted capability]');
  return redacted.replace(/[A-Za-z0-9_-]{80,}\.[A-Za-z0-9_-]{32,}/g, '[redacted capability]');
}

export function verifyHermesCapability(token: string, signingKey: string, expected: CapabilityScope, now = Date.now()): HermesCapability {
  const [encoded, signature, ...extra] = String(token || '').split('.');
  if (!encoded || !signature || extra.length) throw new Error('Malformed Hermes capability token.');
  const expectedSignature = sign(encoded, signingKey);
  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) throw new Error('Invalid Hermes capability signature.');
  let payload: HermesCapability;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw new Error('Malformed Hermes capability payload.'); }
  if (payload?.v !== 1 || !isSafeScope(String(payload?.jti || ''), 80) || !isSafeScope(String(payload?.company_id || ''), 160) || !isSafeScope(String(payload?.employee_id || ''), 80) || !Number.isSafeInteger(payload?.task_id) || payload.task_id < 1 || !payload?.intent || !Number.isFinite(payload?.exp)) throw new Error('Invalid Hermes capability claims.');
  if (payload.exp < now) throw new Error('Expired Hermes capability token.');
  if (payload.company_id !== expected.company_id || payload.employee_id !== expected.employee_id || payload.task_id !== expected.task_id || payload.intent !== expected.intent) throw new Error('Hermes capability scope mismatch.');
  return payload;
}
