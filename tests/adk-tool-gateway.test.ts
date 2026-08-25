import { describe, expect, it } from 'vitest';
import { authorizeToolRequest } from '../src/adk/tool-gateway.js';

const baseRequest = {
  companyId: 'company-a',
  requesterCompanyId: 'company-a',
  employeeId: 'backend_developer',
  connectorEmployeeId: 'backend_developer',
  connectorId: 101,
  toolName: 'github.read_repository',
  capability: 'repository.read',
  action: 'read' as const,
  environment: 'development' as const,
  connectorStatus: 'connected' as const,
  grantAccessLevel: 'read_only' as const,
  toolRisk: 'read' as const,
  approvalStatus: 'none' as const,
};

describe('Caveworkers ADK tool gateway', () => {
  it('allows an assigned, connected, read-only GitHub read', () => {
    expect(authorizeToolRequest(baseRequest)).toMatchObject({ decision: 'ALLOW', company_id: 'company-a', employee_id: 'backend_developer' });
  });

  it('denies cross-tenant requests before connector execution', () => {
    expect(authorizeToolRequest({ ...baseRequest, requesterCompanyId: 'company-b' })).toMatchObject({ decision: 'DENY' });
  });

  it('denies a connector assigned to another employee', () => {
    expect(authorizeToolRequest({ ...baseRequest, connectorEmployeeId: 'qa_engineer' })).toMatchObject({ decision: 'DENY' });
  });

  it('requires approval for write capabilities and never upgrades read-only grants', () => {
    expect(authorizeToolRequest({ ...baseRequest, action: 'write', capability: 'pull_request.create', toolRisk: 'write', grantAccessLevel: 'requires_approval' })).toMatchObject({ decision: 'APPROVAL_REQUIRED' });
    expect(authorizeToolRequest({ ...baseRequest, action: 'write', capability: 'pull_request.create', toolRisk: 'write', grantAccessLevel: 'read_only', approvalStatus: 'approved' })).toMatchObject({ decision: 'DENY' });
  });
});
