(() => {
  const employeeId = document.body.dataset.employeeId;
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const request = async (url, options = {}) => {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request could not be completed.');
    return body;
  };
  const formatTime = (value) => { try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); } catch (_) { return ''; } };

  let profile = null;
  let planData = null;

  function renderProfile(data) {
    profile = data;
    const state = $('#employee-instance-state');
    const rail = $('#employee-status');
    const status = data.active_in_workspace ? 'Active in your workforce' : 'Catalog employee — activate in settings';
    const runtime = data.private_runtime || {};
    state.textContent = runtime.status === 'configured_pending_readiness' ? `${status} · Private runtime readying` : status;
    rail.textContent = runtime.status === 'configured_pending_readiness' ? 'Private runtime configured' : data.active_in_workspace ? 'Instance active' : 'Activation needed';
    const connectors = data.connectors || [];
    $('#employee-connector-list').innerHTML = connectors.length ? connectors.map((connector) => {
      const grants = (connector.tool_grants || []).map((grant) => `<span class="employee-tool-grant">${escapeHtml(grant.name || grant.tool_name || 'tool')} · ${escapeHtml(grant.access_level || 'read')}</span>`).join(' ');
      return `<div class="employee-connector-item"><div><b>${escapeHtml(connector.name || connector.service || 'Connector')}</b><small>${escapeHtml(connector.service || 'MCP')} · ${grants || 'Tool discovery pending'}</small></div><span class="connector-state">${connector.status === 'connected' || connector.status === 'active' ? 'CONNECTED' : escapeHtml(String(connector.status || 'SETUP').toUpperCase())}</span></div>`;
    }).join('') : '<p class="empty-state-sm">No tenant connector is assigned to this employee yet. Add one in Workspace Settings.</p>';
    const teammates = data.teammates || [];
    $('#employee-teammates').innerHTML = teammates.length ? teammates.map((teammate) => `<div class="employee-teammate-item"><div><b>${escapeHtml(teammate.name)} · ${escapeHtml(teammate.role)}</b><small>${escapeHtml(teammate.department || 'AI specialist')} · Task handoffs are recorded in the shared group chat.</small></div><a href="/employee/${encodeURIComponent(teammate.id)}">Open ↗</a></div>`).join('') : '<p class="empty-state-sm">Activate another employee in Workspace Settings to enable task handoffs.</p>';
    renderMemory(data.memory || []);
  }

  function renderMemory(memory) {
    $('#employee-memory-list').innerHTML = memory.length ? memory.map((entry) => `<div class="employee-memory-item"><div><b>${escapeHtml(String(entry.category || 'preference').toUpperCase())}</b><small>${escapeHtml(entry.content)}</small><small>${formatTime(entry.created_at)}</small></div><button class="memory-delete" data-memory-id="${escapeHtml(entry.id)}" type="button">Delete</button></div>`).join('') : '<p class="empty-state-sm">No role memory saved yet. Add a playbook or handoff rule above.</p>';
    document.querySelectorAll('.memory-delete').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('Delete this tenant-only memory note?')) return;
      try { await request(`/api/employees/${encodeURIComponent(employeeId)}/memory/${encodeURIComponent(button.dataset.memoryId)}`, { method: 'DELETE' }); await loadProfile(); } catch (error) { alert(error.message); }
    }));
  }

  function entriesFromSection(section) {
    return Array.isArray(section) ? section.join('\n') : '';
  }

  function setConversationAvailability(available) {
    const input = $('#employee-chat-input');
    const button = $('#employee-chat-form button');
    if (input) input.disabled = !available;
    if (button) button.disabled = !available;
    if (!available) $('#employee-conversation').innerHTML = '<p class="empty-state-sm">The role conversation remains protected until the owner approves the detailed pre-build plan.</p>';
  }

  function renderPlan(data) {
    planData = data;
    const summary = data.summary || { status: 'not_started', ready_for_implementation: false };
    const plan = data.plan;
    const status = $('#employee-plan-status');
    const stateLabels = { not_started: 'PLAN NEEDED', draft: 'AWAITING OWNER REVIEW', approved: 'APPROVED', rejected: 'REVISION NEEDED', implemented: 'IMPLEMENTED' };
    status.textContent = stateLabels[summary.status] || 'PLAN NEEDED';
    status.className = `plan-workspace-state ${summary.status}`;
    const model = data.recommended_model || planData?.recommended_model || {};
    $('#employee-plan-model-summary').innerHTML = `<span>OpenRouter primary <b>${escapeHtml(model.primary || 'Not configured')}</b></span><span>Fallback <b>${escapeHtml(model.fallback || 'Not configured')}</b></span><span>Temperature <b>${escapeHtml(model.temperature ?? '—')}</b></span>`;
    document.querySelectorAll('[data-plan-section]').forEach((field) => { field.value = entriesFromSection(plan?.sections?.[field.dataset.planSection]); });
    const decisions = $('#employee-plan-decisions');
    const decisionCopy = $('#employee-plan-decision-copy');
    decisions.hidden = summary.status !== 'draft';
    decisionCopy.textContent = summary.status === 'draft'
      ? `Version ${plan?.version || 1} is ready for your review. Approving it enables this role-specific conversation only; it never authorizes financial or payment actions.`
      : summary.status === 'approved'
        ? 'The owner-approved plan enables the dedicated conversation. Live Razorpay operations remain owner-only.'
        : 'Save all nine plan sections to create an owner-reviewable draft.';
    setConversationAvailability(Boolean(summary.ready_for_implementation));
  }

  function renderConversation(messages) {
    const container = $('#employee-conversation');
    const items = Array.isArray(messages) ? messages.slice(-50) : [];
    container.innerHTML = items.length ? items.map((entry) => `<article class="employee-chat-message ${entry.sender === 'manager' ? 'manager' : 'employee'}"><span>${escapeHtml(entry.sender === 'manager' ? 'YOU' : profile?.employee?.name || 'EMPLOYEE')}</span><p>${escapeHtml(entry.body)}</p><small>${escapeHtml(formatTime(entry.created_at))}</small></article>`).join('') : '<p class="empty-state-sm">No messages yet. Set an outcome, context, and evidence standard to begin.</p>';
    container.scrollTop = container.scrollHeight;
  }

  async function loadProfile() {
    try { renderProfile(await request(`/api/employees/${encodeURIComponent(employeeId)}/profile`)); }
    catch (error) { $('#employee-connector-list').innerHTML = `<p class="empty-state-sm">${escapeHtml(error.message)}</p>`; $('#employee-status').textContent = 'Unavailable'; }
  }

  async function loadPlan() {
    try { renderPlan(await request(`/api/employees/${encodeURIComponent(employeeId)}/prebuild-plan`)); }
    catch (error) { $('#employee-plan-status').textContent = 'PLAN UNAVAILABLE'; $('#employee-plan-model-summary').textContent = error.message; }
  }

  async function loadConversation() {
    if (!planData?.summary?.ready_for_implementation) return;
    try { renderConversation((await request(`/api/employees/${encodeURIComponent(employeeId)}/conversation`)).messages || []); }
    catch (error) { $('#employee-conversation').innerHTML = `<p class="empty-state-sm">${escapeHtml(error.message)}</p>`; }
  }

  $('#employee-memory-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = $('#employee-memory-content').value.trim();
    if (!content) return;
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try {
      await request(`/api/employees/${encodeURIComponent(employeeId)}/memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: $('#employee-memory-category').value, content }) });
      $('#employee-memory-content').value = ''; await loadProfile();
    } catch (error) { alert(error.message); } finally { button.disabled = false; }
  });

  $('#employee-plan-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const sections = {};
    document.querySelectorAll('[data-plan-section]').forEach((field) => { sections[field.dataset.planSection] = field.value.split('\n').map((entry) => entry.trim()).filter(Boolean); });
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const response = await request(`/api/employees/${encodeURIComponent(employeeId)}/prebuild-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections }) });
      renderPlan({ ...(planData || {}), ...response });
    } catch (error) { alert(error.message); } finally { button.disabled = false; }
  });

  $('#employee-plan-approve')?.addEventListener('click', async () => {
    if (!window.confirm('Approve this detailed plan and enable the dedicated role conversation? This does not approve financial or payment operations.')) return;
    try {
      const response = await request(`/api/employees/${encodeURIComponent(employeeId)}/prebuild-plan/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approved' }) });
      renderPlan({ ...(planData || {}), ...response });
      await loadConversation();
    } catch (error) { alert(error.message); }
  });

  $('#employee-plan-reject')?.addEventListener('click', async () => {
    try {
      const response = await request(`/api/employees/${encodeURIComponent(employeeId)}/prebuild-plan/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'rejected' }) });
      renderPlan({ ...(planData || {}), ...response });
    } catch (error) { alert(error.message); }
  });

  $('#employee-chat-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('#employee-chat-input');
    const message = input.value.trim();
    if (!message) return;
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const response = await request(`/api/employees/${encodeURIComponent(employeeId)}/conversation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      renderConversation(response.messages || []);
      input.value = '';
    } catch (error) { alert(error.message); } finally { button.disabled = false; }
  });

  $('#menuButton')?.addEventListener('click', () => document.querySelector('.side-rail')?.classList.toggle('open'));
  Promise.all([loadProfile(), loadPlan()]).then(() => loadConversation());
})();
