import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const template = readFileSync(resolve(process.cwd(), 'templates/command.html'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'static/command.css'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'static/command.js'), 'utf8');

describe('company-room composer contract', () => {
  it('keeps note posting distinct from protected work starts and styles both controls responsively', () => {
    expect(template).toContain('id="send-note"');
    expect(template).toContain('id="run"');
    expect(styles).toContain('.room-note-button');
    expect(styles).toContain('grid-template-columns: auto auto');
    expect(styles).toContain('grid-template-columns: 1fr 1fr');
    expect(client).toContain("/api/workforce/workroom/messages");
    expect(client).toContain("/api/tasks");
  });

  it('does not represent an unexpected queue failure as completed work', () => {
    expect(client).toContain("/task could not be queued safely/i");
    expect(client).toContain("error.payload?.code === 'task_queue_unavailable'");
    expect(client).toContain('Work not started');
    expect(client).toContain('No agent work was queued');
  });
});
