import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('Firestore client rules', () => {
  it('requires the verified company boundary for tenant reads and denies browser writes to company records', () => {
    expect(rules).toContain('allow read: if sameCompany(companyId);');
    expect(rules).toContain('allow create, update, delete: if false;');
    expect(rules).not.toContain('allow read, create, update, delete: if signedIn();');
  });

  it('does not permit an authenticated browser to enumerate top-level queue, workflow, or payment records', () => {
    expect(rules).toContain('resource.data.company_id == userCompanyId()');
    expect(rules).not.toContain('match /payments/{paymentId} {\n      allow read: if signedIn();');
  });
});
