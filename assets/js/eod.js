// EOD tab — latest EOD summary + trigger
;(function () {
  async function loadEodSummary () {
    const container = document.getElementById('eod-content')
    if (!container) return
    container.innerHTML = '<div class="skeleton"></div><div class="skeleton mt-8"></div>'
    try {
      const { data, error } = await window.sb
        .from('eod_summaries')
        .select('*')
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        container.innerHTML = '<p class="text-muted text-sm">No EOD summaries yet. Run /eod-wrap to generate the first one.</p>'
        return
      }
      const completed  = Array.isArray(data.tasks_completed) ? data.tasks_completed : []
      const rolledOver = Array.isArray(data.tasks_rolled_over) ? data.tasks_rolled_over : []
      const flags      = Array.isArray(data.flags) ? data.flags : []
      const reels = data.reels_completed ?? 0
      const target = data.reels_target ?? 3
      container.innerHTML = `
        <div class="briefing-header">
          <div class="briefing-date">🌙 ${data.summary_date}</div>
          <span class="badge ${reels >= target ? 'green' : reels > 0 ? 'amber' : 'red'}">${reels}/${target} reels</span>
        </div>
        <div class="metrics-grid mb-12" style="grid-template-columns:repeat(3,1fr)">
          <div class="metric-card ${reels>=target?'good':reels>0?'amber':'alert'}">
            <div class="metric-label">Reels</div>
            <div class="metric-val">${reels}/${target}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Scripts at close</div>
            <div class="metric-val ${(data.scripts_ready_at_close??0)>0?'good':'alert'}">${data.scripts_ready_at_close ?? 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Tasks done</div>
            <div class="metric-val">${completed.length}</div>
          </div>
        </div>
        ${completed.length ? `<div class="card mb-12"><div class="card-title">✅ Completed</div><ul class="task-list">${completed.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul></div>` : ''}
        ${rolledOver.length ? `<div class="card mb-12"><div class="card-title">⏭️ Rolling over to tomorrow</div><ul class="task-list">${rolledOver.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul></div>` : ''}
        ${flags.length ? `<div class="card mb-12"><div class="card-title">⚠️ Flags</div><ul class="task-list">${flags.map(f => `<li style="color:var(--danger)">${escHtml(f)}</li>`).join('')}</ul></div>` : ''}
        <div class="card"><div class="stat-row"><span class="stat-label">KPI updated</span><span class="stat-val">${data.kpi_updated ? '✅ Yes' : '⏳ Pending (Phase D)'}</span></div></div>`
    } catch (e) {
      container.innerHTML = '<p class="error-state">Failed to load EOD summary.</p>'
    }
  }

  async function triggerEodWrap () {
    const btn = document.getElementById('trigger-eod-btn')
    const status = document.getElementById('eod-trigger-status')
    if (btn) btn.disabled = true
    try {
      const { error } = await window.sb.from('requests').insert({
        type: 'eod-wrap',
        status: 'pending',
        payload: { requested_by: 'dashboard', requested_at: new Date().toISOString() }
      })
      if (error) throw error
      if (status) status.textContent = '✓ Request queued — Claude Code will process this at next session end.'
    } catch (e) {
      if (status) status.textContent = 'Failed to queue request: ' + e.message
    } finally {
      if (btn) btn.disabled = false
    }
  }

  function escHtml (s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  const triggerBtn = document.getElementById('trigger-eod-btn')
  if (triggerBtn) triggerBtn.addEventListener('click', triggerEodWrap)

  loadEodSummary()
  window.eodRefresh = loadEodSummary
})()
