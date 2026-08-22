import { getHermesEmployeeContract } from './hermes-contracts.js';

export type HermesToolIntent = {
  companyId: string;
  employeeId: string;
  taskId: number;
  intent: string;
  environment?: 'sandbox' | 'production' | 'unknown';
  requestedAction?: string;
};

export type HermesPolicyDecision = {
  status: 'allowed' | 'requires_approval' | 'blocked';
  code: string;
  summary: string;
};

const LIVE_PAYMENT_PATTERN = /razorpay|payment|checkout|capture|refund|invoice\.(?:create|send)|payout/i;
const EXTERNAL_WRITE_PATTERN = /(?:\.write|\.update|\.create|\.delete|\.send|\.publish|\.commit|\.deploy|\.migrate|\.execute)$/i;

export function evaluateHermesToolIntent(intent: HermesToolIntent): HermesPolicyDecision {
  const contract = getHermesEmployeeContract(intent.employeeId);
  if (!contract) return { status: 'blocked', code: 'unknown_employee', summary: 'Only the four approved Caveworkers employees may use Hermes.' };
  if (!intent.companyId || !Number.isFinite(intent.taskId) || intent.taskId < 1) return { status: 'blocked', code: 'invalid_scope', summary: 'Hermes work must be bound to one verified tenant and task.' };
  const normalizedIntent = String(intent.intent || '').trim().toLowerCase();
  const requestedAction = String(intent.requestedAction || '');
  if (LIVE_PAYMENT_PATTERN.test(normalizedIntent) || LIVE_PAYMENT_PATTERN.test(requestedAction)) {
    return { status: 'blocked', code: 'live_payment_prohibited', summary: 'Hermes cannot perform or invoke a live Razorpay payment operation.' };
  }
  if (!contract.allowedToolIntents.includes(normalizedIntent)) {
    return { status: 'blocked', code: 'tool_not_allowed', summary: `The ${contract.employeeId} contract does not allow this tool intent.` };
  }
  if (normalizedIntent === 'test.sandbox.run') {
    if (contract.employeeId !== 'qa_engineer' || intent.environment !== 'sandbox') {
      return { status: 'blocked', code: 'sandbox_required', summary: 'Only the QA Engineer may request this intent and only in an approved sandbox.' };
    }
    return { status: 'requires_approval', code: 'sandbox_run_requires_approval', summary: 'A sandbox test run requires a recorded owner approval before dispatch.' };
  }
  if (EXTERNAL_WRITE_PATTERN.test(normalizedIntent)) {
    return { status: 'requires_approval', code: 'external_write_requires_approval', summary: 'External writes require a Caveworkers approval record before dispatch.' };
  }
  return { status: 'allowed', code: 'read_or_draft_allowed', summary: 'The requested read-only or draft intent is within the employee contract.' };
}
