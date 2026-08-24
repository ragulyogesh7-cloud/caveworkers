export type GoldenTaskCase = {
  id: string;
  prompt: string;
  expected_employee: string;
  expected_name: string;
  category: string;
};

export const GOLDEN_TASK_CASES: GoldenTaskCase[] = [
  { id: 'analyst-kpi-variance', prompt: 'Data Analyst, analyze the quarterly KPI variance and identify the three largest revenue drivers.', expected_employee: 'data_analyst', expected_name: 'Maya', category: 'analytics' },
  { id: 'analyst-forecast', prompt: 'Prepare a cash-flow forecast with assumptions, sensitivity cases, and evidence limits.', expected_employee: 'data_analyst', expected_name: 'Maya', category: 'analytics' },
  { id: 'backend-incident', prompt: 'Backend Developer, inspect the GitHub deployment incident and prepare a safe engineering response plan.', expected_employee: 'backend_developer', expected_name: 'Arav', category: 'engineering' },
  { id: 'backend-migration', prompt: 'Design a backwards-compatible API and database migration with rollback and tests.', expected_employee: 'backend_developer', expected_name: 'Arav', category: 'engineering' },
  { id: 'security-access', prompt: 'Cybersecurity Analyst, review the privileged access posture and prepare a least-privilege remediation plan.', expected_employee: 'cybersecurity_analyst', expected_name: 'Iris', category: 'security' },
  { id: 'security-incident', prompt: 'Investigate the suspicious administrator login and outline safe containment options.', expected_employee: 'cybersecurity_analyst', expected_name: 'Iris', category: 'security' },
  { id: 'qa-regression', prompt: 'QA Engineer, prepare a regression suite for the checkout workflow with explicit evidence and release criteria.', expected_employee: 'qa_engineer', expected_name: 'Priya', category: 'quality' },
  { id: 'qa-release', prompt: 'Review the release candidate, identify coverage gaps, and provide a go/no-go recommendation.', expected_employee: 'qa_engineer', expected_name: 'Priya', category: 'quality' }
];
