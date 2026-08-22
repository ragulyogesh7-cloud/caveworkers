export type HermesRunState = 'started' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled' | 'stopping';

export type HermesCapabilities = {
  features?: {
    run_submission?: boolean;
    run_status?: boolean;
    run_events_sse?: boolean;
    run_stop?: boolean;
    run_approval?: boolean;
  };
};

export type HermesRuntimeConfig = {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  cloudRunAudience?: string;
  requestTimeoutMs: number;
  maxConcurrentRuns: number;
  maxToolCalls: number;
};

export type AgentRuntimeRunRequest = {
  taskId: number;
  companyId: string;
  employeeId: string;
  input: string;
  instructions: string;
  conversationHistory?: Array<{ role: string; content: string }>;
};

export type AgentRuntimeRun = {
  runtime: 'hermes';
  runId: string;
  sessionId: string;
  status: HermesRunState;
  output?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

export type AgentRuntimeHealth = {
  configured: boolean;
  ready: boolean;
  capabilities?: HermesCapabilities;
  reason?: string;
};

export interface AgentRuntime {
  readonly kind: 'hermes';
  isEnabled(): boolean;
  health(): Promise<AgentRuntimeHealth>;
  startRun(request: AgentRuntimeRunRequest): Promise<AgentRuntimeRun>;
  getRun(runId: string): Promise<AgentRuntimeRun>;
  stopRun(runId: string): Promise<AgentRuntimeRun>;
  resolveApproval(runId: string, decision: 'approved' | 'rejected'): Promise<AgentRuntimeRun>;
}

export type HermesFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type IdentityTokenProvider = () => Promise<string | undefined>;

function boundedInt(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  return Math.min(Math.max(Number(value || fallback) || fallback, minimum), maximum);
}

export function loadHermesRuntimeConfig(env: Record<string, string | undefined> = process.env): HermesRuntimeConfig {
  const apiUrl = String(env.HERMES_API_URL || '').trim().replace(/\/$/, '');
  const apiKey = String(env.HERMES_API_KEY || '').trim();
  return {
    enabled: env.HERMES_ENABLED === 'true' && Boolean(apiUrl && apiKey),
    apiUrl,
    apiKey,
    cloudRunAudience: String(env.HERMES_CLOUD_RUN_AUDIENCE || '').trim() || undefined,
    requestTimeoutMs: boundedInt(env.HERMES_RUN_TIMEOUT_MS, 90_000, 5_000, 180_000),
    maxConcurrentRuns: boundedInt(env.HERMES_MAX_CONCURRENT_RUNS, 2, 1, 16),
    maxToolCalls: boundedInt(env.HERMES_MAX_TOOL_CALLS, 12, 1, 50)
  };
}

export function hermesSessionId(companyId: string, employeeId: string, taskId: number) {
  const value = `cw:${companyId}:${employeeId}:${taskId}`;
  if (!/^[A-Za-z0-9:_-]{1,256}$/.test(value)) throw new Error('Invalid Hermes session identity.');
  return value;
}

export function hermesCapabilitiesReady(capabilities: HermesCapabilities | undefined) {
  const features = capabilities?.features;
  return Boolean(features?.run_submission && features.run_status && features.run_events_sse && features.run_stop && features.run_approval);
}

function normalizeRun(payload: any, sessionId: string): AgentRuntimeRun {
  const statusMap: Record<string, HermesRunState> = {
    started: 'started', queued: 'started', running: 'running', waiting_for_approval: 'waiting_for_approval',
    approval_paused: 'waiting_for_approval', completed: 'completed', failed: 'failed', cancelled: 'cancelled', stopping: 'stopping'
  };
  const runId = String(payload?.run_id || payload?.id || '').trim();
  if (!runId || runId.length > 256) throw new Error('Hermes returned an invalid run identifier.');
  return {
    runtime: 'hermes',
    runId,
    sessionId: String(payload?.session_id || sessionId).slice(0, 256),
    status: statusMap[String(payload?.status || 'started')] || 'running',
    output: typeof payload?.output === 'string' ? payload.output.slice(0, 24_000) : undefined,
    usage: payload?.usage && typeof payload.usage === 'object' ? {
      input_tokens: Number(payload.usage.input_tokens || payload.usage.prompt_tokens) || undefined,
      output_tokens: Number(payload.usage.output_tokens || payload.usage.completion_tokens) || undefined,
      total_tokens: Number(payload.usage.total_tokens) || undefined
    } : undefined
  };
}

export class HermesAgentRuntime implements AgentRuntime {
  readonly kind = 'hermes' as const;
  private readonly fetchImpl: HermesFetch;
  private readonly identityTokenProvider?: IdentityTokenProvider;

  constructor(readonly config: HermesRuntimeConfig, options: { fetchImpl?: HermesFetch; identityTokenProvider?: IdentityTokenProvider } = {}) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.identityTokenProvider = options.identityTokenProvider;
  }

  isEnabled() {
    return this.config.enabled;
  }

  private assertEnabled() {
    if (!this.isEnabled()) throw new Error('Hermes runtime is disabled or not fully configured.');
  }

  private async headers() {
    this.assertEnabled();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: 'application/json'
    };
    if (this.identityTokenProvider) {
      const token = await this.identityTokenProvider();
      if (token) headers['X-Serverless-Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request(path: string, init: RequestInit = {}) {
    const headers = { ...(await this.headers()), ...(init.headers as Record<string, string> || {}) };
    const response = await this.fetchImpl(`${this.config.apiUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text.slice(0, 500) }; }
    if (!response.ok) {
      const message = String(payload?.error?.message || payload?.error || `Hermes returned HTTP ${response.status}`).slice(0, 500);
      throw new Error(message);
    }
    return payload;
  }

  async health(): Promise<AgentRuntimeHealth> {
    if (!this.isEnabled()) return { configured: Boolean(this.config.apiUrl && this.config.apiKey), ready: false, reason: 'Hermes is disabled or missing required configuration.' };
    try {
      const capabilities = await this.request('/v1/capabilities', { method: 'GET' }) as HermesCapabilities;
      return { configured: true, ready: hermesCapabilitiesReady(capabilities), capabilities, reason: hermesCapabilitiesReady(capabilities) ? undefined : 'Hermes is missing required run lifecycle capabilities.' };
    } catch (error: any) {
      return { configured: true, ready: false, reason: String(error?.message || 'Hermes health check failed.').slice(0, 500) };
    }
  }

  async startRun(request: AgentRuntimeRunRequest): Promise<AgentRuntimeRun> {
    const sessionId = hermesSessionId(request.companyId, request.employeeId, request.taskId);
    const payload = await this.request('/v1/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: request.input.slice(0, 12_000),
        session_id: sessionId,
        instructions: request.instructions.slice(0, 16_000),
        conversation_history: request.conversationHistory?.slice(-20).map((message) => ({ role: String(message.role).slice(0, 32), content: String(message.content).slice(0, 8_000) }))
      })
    });
    return normalizeRun(payload, sessionId);
  }

  async getRun(runId: string): Promise<AgentRuntimeRun> {
    const safeId = encodeURIComponent(String(runId).slice(0, 256));
    return normalizeRun(await this.request(`/v1/runs/${safeId}`, { method: 'GET' }), '');
  }

  async stopRun(runId: string): Promise<AgentRuntimeRun> {
    const safeId = encodeURIComponent(String(runId).slice(0, 256));
    return normalizeRun(await this.request(`/v1/runs/${safeId}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), '');
  }

  async resolveApproval(runId: string, decision: 'approved' | 'rejected'): Promise<AgentRuntimeRun> {
    const safeId = encodeURIComponent(String(runId).slice(0, 256));
    return normalizeRun(await this.request(`/v1/runs/${safeId}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) }), '');
  }
}

export function createHermesAgentRuntime(env: Record<string, string | undefined> = process.env, options: { fetchImpl?: HermesFetch; identityTokenProvider?: IdentityTokenProvider } = {}) {
  return new HermesAgentRuntime(loadHermesRuntimeConfig(env), options);
}
