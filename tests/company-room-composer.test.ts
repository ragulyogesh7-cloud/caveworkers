import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const template = readFileSync(resolve(process.cwd(), 'templates/command.html'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'static/command.css'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'static/command.js'), 'utf8');

describe('company-room composer contract', () => {
  it('defaults the room to a natural whole-team conversation and keeps both composer actions available', () => {
    expect(template).toContain('id="send-note"');
    expect(template).toContain('id="run"');
    expect(template).toContain('Whole team conversation');
    expect(template).toContain('Maya, Iris, Arav, and Priya');
    expect(styles).toContain('.room-note-button');
    expect(styles).toContain('grid-template-columns: auto auto');
    expect(styles).toContain('grid-template-columns: 1fr 1fr');
    expect(client).toContain("/api/workforce/workroom");
    expect(client).toContain("/api/tasks");
    expect(client).toContain("preferred_employee_id: '__whole_team__'");
    expect(client).toContain('idempotency_key');
  });

  it('does not represent an unexpected queue failure as completed work', () => {
    expect(client).toContain("/task could not be queued safely/i");
    expect(client).toContain("error.payload?.code === 'task_queue_unavailable'");
    expect(client).toContain('Room queue is retryable');
    expect(client).toContain('The workforce queue is retryable');
  });
});
