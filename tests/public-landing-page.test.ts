import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const landingPage = readFileSync(resolve(process.cwd(), 'deskforce.html'), 'utf8');

describe('public landing page workforce contract', () => {
  it('presents exactly the approved four employee roles without legacy names', () => {
    for (const role of ['Data Analyst', 'Cybersecurity Analyst', 'Backend Developer', 'QA Automation Engineer']) {
      expect(landingPage).toContain(role);
    }
    expect(landingPage).not.toContain('Talent & HR Manager');
    expect(landingPage).not.toContain('legacy-ten-employee');
    expect(landingPage).toContain('04 / 04');
  });

  it('labels product examples as illustrative and avoids unsupported live-performance claims', () => {
    expect(landingPage).toContain('Illustrative task route');
    expect(landingPage).toContain('Illustrative workspace');
    expect(landingPage).not.toContain('Net savings');
    expect(landingPage).not.toContain('All systems nominal');
    expect(landingPage).not.toContain('Notion');
    expect(landingPage).not.toContain('Slack');
  });
});
