import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

export const PORT = Number(process.env.PORT || '3000') || 3000;
export const HOST = '0.0.0.0';
export const IS_PRODUCTION = process.env.CAVEWORKERS_ENV === 'production';
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);

export const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
export const OPENROUTER_KEY_READY = Boolean(OPENROUTER_API_KEY && (OPENROUTER_API_KEY.startsWith('sk-or-') || OPENROUTER_API_KEY.length >= 15));
export const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
export const ANALYST_MODEL = process.env.ANALYST_MODEL || 'google/gemini-3.1-pro-preview';
export const WORKFORCE_MODEL_OVERRIDE = (process.env.WORKFORCE_MODEL || '').trim();

export const OPENROUTER_TIMEOUT_MS = Math.min(Math.max(Number(process.env.OPENROUTER_TIMEOUT_MS || '30000') || 30000, 5000), 60000);
export const ANALYST_MAX_TOKENS = Math.min(Math.max(Number(process.env.ANALYST_MAX_TOKENS || '900') || 900, 128), 2000);
export const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'https://caveworkers.ai.studio').replace(/\/$/, '');
export const GOOGLE_OAUTH_CLIENT_ID = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
export const GOOGLE_OAUTH_CLIENT_SECRET = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
export const GOOGLE_OAUTH_REDIRECT_URI = (process.env.GOOGLE_OAUTH_REDIRECT_URI || `${PUBLIC_APP_URL}/api/google/oauth/callback`).replace(/\/$/, '');
export const MCP_TOKEN_ENCRYPTION_KEY = (process.env.MCP_TOKEN_ENCRYPTION_KEY || '').trim();
export const COMPANY_EMAIL = (process.env.COMPANY_EMAIL || '').trim().toLowerCase();
export const SMTP_ENABLED = process.env.SMTP_ENABLED === 'true';
export const SMTP_HOST = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
export const SMTP_PORT = Math.min(Math.max(Number(process.env.SMTP_PORT || '587') || 587, 1), 65535);
export const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
export const SMTP_USER = (process.env.SMTP_USER || COMPANY_EMAIL).trim().toLowerCase();
export const SMTP_APP_PASSWORD = (process.env.SMTP_APP_PASSWORD || '').trim();
export const SMTP_CONFIGURED = SMTP_ENABLED && Boolean(COMPANY_EMAIL && SMTP_USER && SMTP_APP_PASSWORD && SMTP_USER === COMPANY_EMAIL && SMTP_HOST);
export const OAUTH_STATE_SECRET = (process.env.FLASK_SECRET || process.env.OAUTH_STATE_SECRET || '').trim();
export const GOOGLE_OAUTH_CONFIGURED = Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_REDIRECT_URI && (!IS_PRODUCTION || OAUTH_STATE_SECRET));
export const ALWAYS_ON_WORKER_ENABLED = process.env.ALWAYS_ON_WORKER_ENABLED !== 'false';
export const WORKER_POLL_MS = Math.min(Math.max(Number(process.env.WORKER_POLL_MS || '1500') || 1500, 500), 10000);
export const WEB_RESEARCH_ENABLED = process.env.WEB_RESEARCH_ENABLED === 'true';
export const TAVILY_API_KEY = (process.env.TAVILY_API_KEY || '').trim();
export const BRAVE_SEARCH_API_KEY = (process.env.BRAVE_SEARCH_API_KEY || '').trim();
export const WORKFLOW_SCHEDULER_POLL_MS = Math.min(Math.max(Number(process.env.WORKFLOW_SCHEDULER_POLL_MS || '60000') || 60000, 30000), 600000);
export const SCHEDULER_TICK_SECRET = (process.env.SCHEDULER_TICK_SECRET || (IS_PRODUCTION ? '' : 'test-scheduler-secret')).trim();
export const TENANT_DELETION_GRACE_DAYS = Math.min(Math.max(Number(process.env.TENANT_DELETION_GRACE_DAYS || '14') || 14, 1), 30);
export const TENANT_EXPORT_EXPIRY_DAYS = Math.min(Math.max(Number(process.env.TENANT_EXPORT_EXPIRY_DAYS || '7') || 7, 1), 30);

export interface SpecialistModelConfig {
  model: string;
  fallbackModel: string;
  roleTitle: string;
  systemPrompt: string;
  providerPreferences?: { allow_fallbacks?: boolean; require_parameters?: boolean; data_collection?: 'allow' | 'deny'; zdr?: boolean };
}

export const EMPLOYEE_SPECIALIST_CONFIGS: Record<string, SpecialistModelConfig> = {
  data_analyst: {
    model: 'google/gemini-3.1-pro-preview',
    fallbackModel: 'anthropic/claude-sonnet-5',
    roleTitle: 'Data Analyst',
    systemPrompt: `You are Maya, the Data Analyst at Caveworkers. You provide evidence-first quantitative analysis, safe read-only SQL drafts, metric definitions, KPI variance analysis, and scenario-based forecasts. Start with the decision-relevant finding, then state evidence, assumptions, limitations, and a clear next action. Never invent source data, tool results, external actions, citations, or certainty. Treat forecasts as scenarios, not commitments.`,
    providerPreferences: { allow_fallbacks: true, require_parameters: true, data_collection: 'deny' }
  },
  cybersecurity_analyst: {
    model: 'anthropic/claude-sonnet-5',
    fallbackModel: 'google/gemini-3.1-pro-preview',
    roleTitle: 'Cybersecurity Analyst',
    systemPrompt: `You are Iris, the Cybersecurity Analyst at Caveworkers. You are an evidence-led, least-privilege security decision-support specialist. Classify work as access/identity, incident, vulnerability, IT service, compliance, questionnaire, change control, or infrastructure risk.`,
    providerPreferences: { allow_fallbacks: true, require_parameters: true, data_collection: 'deny' }
  },
  backend_developer: {
    model: 'openai/gpt-5.3-codex',
    fallbackModel: 'anthropic/claude-sonnet-5',
    roleTitle: 'Full Stack Backend Developer',
    systemPrompt: `You are Arav, the Full Stack Backend Developer at Caveworkers. You classify work as a bug, feature, incident, architecture, release, performance, migration, or infrastructure request. Design APIs with validation, authorization, error handling, idempotency, and observability.`,
    providerPreferences: { allow_fallbacks: true, require_parameters: true, data_collection: 'deny' }
  },
  qa_engineer: {
    model: 'anthropic/claude-sonnet-5',
    fallbackModel: 'google/gemini-3.7-flash',
    roleTitle: 'Software QA / Automation Engineer',
    systemPrompt: `You are Priya, the Software QA & Automation Engineer at Caveworkers. You design regression suits, write automated test cases, execute edge-case validations, and verify deployment reliability.`,
    providerPreferences: { allow_fallbacks: true, require_parameters: true, data_collection: 'deny' }
  }
};

export function specialistModelFor(employeeId = 'data_analyst'): string {
  const normalizedId = String(employeeId || 'data_analyst').toLowerCase();
  const config = EMPLOYEE_SPECIALIST_CONFIGS[normalizedId] || EMPLOYEE_SPECIALIST_CONFIGS.data_analyst;
  const employeeOverride = (process.env[`${normalizedId.toUpperCase()}_MODEL`] || '').trim();
  return WORKFORCE_MODEL_OVERRIDE || employeeOverride || config.model;
}
