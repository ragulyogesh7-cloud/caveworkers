import { evaluateAdkPermission, type AdkEmployeeId, type AdkEnvironment, type PermissionDecision } from './workforce.js';

export type GatewayAction = 'read' | 'draft' | 'write';

export interface ToolGatewayRequest {
  companyId: string;
  requesterCompanyId?: string;
  employeeId: string;
  connectorEmployeeId?: string;
  connectorId?: number;
  toolName: string;
  capability: string;
  action: GatewayAction;
  environment?: AdkEnvironment;
  connectorStatus?: 'connected' | 'needs_configuration' | 'error';
  grantAccessLevel?: 'read_only' | 'requires_approval' | 'read_write';
  toolRisk?: 'read' | 'write';
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
}

export interface ToolGatewayDecision {
  decision: PermissionDecision;
  reason: string;
  company_id: string;
  employee_id: string;
  connector_id?: number;
  tool_name: string;
  capability: string;
  audit: {
    tenant_checked: boolean;
    employee_checked: boolean;
    connector_checked: boolean;
    scope_checked: boolean;
    risk_checked: boolean;
    policy_checked: boolean;
    approval_checked: boolean;
  };
}

function baseDecision(request: ToolGatewayRequest, decision: PermissionDecision, reason: string, audit: ToolGatewayDecision['audit']): ToolGatewayDecision {
  return {
    decision,
    reason,
    company_id: request.companyId,
    employee_id: request.employeeId,
    connector_id: request.connectorId,
    tool_name: request.toolName,
    capability: request.capability,
    audit
  };
}

export function authorizeToolRequest(request: ToolGatewayRequest): ToolGatewayDecision {
  const audit = {
    tenant_checked: true,
    employee_checked: true,
    connector_checked: true,
    scope_checked: true,
    risk_checked: true,
    policy_checked: true,
    approval_checked: true
  };
  if (!request.companyId || (request.requesterCompanyId && request.requesterCompanyId !== request.companyId)) {
    return baseDecision(request, 'DENY', 'Tenant boundary failed.', { ...audit, tenant_checked: false });
  }
  const employee = String(request.employeeId || '').trim() as AdkEmployeeId;
  if (!['data_analyst', 'cybersecurity_analyst', 'backend_developer', 'qa_engineer'].includes(employee)) {
    return baseDecision(request, 'DENY', 'Employee is not part of the active four-agent workforce.', { ...audit, employee_checked: false });
  }
  if (request.connectorEmployeeId && request.connectorEmployeeId !== employee) {
    return baseDecision(request, 'DENY', 'Connector is not assigned to this employee.', { ...audit, connector_checked: false });
  }
  if (request.connectorStatus && request.connectorStatus !== 'connected') {
    return baseDecision(request, 'DENY', 'Connector is not connected.', { ...audit, connector_checked: false });
  }
  if (request.action !== 'draft' && !request.grantAccessLevel) {
    return baseDecision(request, 'DENY', 'No employee-specific tool grant exists.', { ...audit, scope_checked: false });
  }
  if (request.toolRisk === 'write' && request.action === 'read') {
    return baseDecision(request, 'DENY', 'A write-classified tool cannot be used through the read path.', { ...audit, risk_checked: false });
  }
  if (request.action === 'read' && request.grantAccessLevel === 'requires_approval') {
    return baseDecision(request, 'DENY', 'Read execution is not permitted while this grant is approval-gated.', { ...audit, policy_checked: false });
  }
  if (request.action === 'write' && request.grantAccessLevel === 'read_only') {
    return baseDecision(request, 'DENY', 'Read-only grants cannot execute writes.', { ...audit, scope_checked: false });
  }
  const policy = evaluateAdkPermission(employee, request.capability, request.environment || 'development');
  if (policy.decision === 'DENY') return baseDecision(request, 'DENY', policy.reason, { ...audit, policy_checked: false });
  if (policy.decision === 'APPROVAL_REQUIRED' && request.approvalStatus !== 'approved') {
    return baseDecision(request, 'APPROVAL_REQUIRED', policy.reason, audit);
  }
  if (request.action === 'write' && request.approvalStatus !== 'approved' && request.grantAccessLevel !== 'read_write') {
    return baseDecision(request, 'APPROVAL_REQUIRED', 'Write execution requires an approved Caveworkers action record.', audit);
  }
  return baseDecision(request, 'ALLOW', 'Tenant, employee, connector, scope, risk, policy, and approval checks passed.', audit);
}
