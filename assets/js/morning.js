// Morning Coffee tab — latest briefing + trigger
;(function () {
  async function loadMorningBriefing () {
    const container = document.getElementById('morning-content')
    if (!container) return
    container.innerHTML = '<div class="skeleton"></div><div class="skeleton mt-8"></div>'
    try {
      const { data, error } = await window.sb
        .from('morning_briefings')
        .select('*')
        .order('briefing_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        container.innerHTML = '<p class="text-muted text-sm">No briefings saved yet. Run /morning-coffee to generate the first one.</p>'
        return
      }
      const tasks = Array.isArray(data.tasks_for_day) ? data.tasks_for_day : []
      const news  = Array.isArray(data.news_headlines) ? data.news_headlines : []
      const processed = Array.isArray(data.requests_processed) ? data.requests_processed : []
      container.innerHTML = `
        <div class="briefing-header">
          <div class="briefing-date">☕ ${data.briefing_date}</div>
          <span class="badge ${data.scripts_ready > 0 ? 'green' : 'red'}">${data.scripts_ready ?? 0} scripts ready</span>
        </div>
        ${data.focus_recommendation ? `<div class="card mb-12"><div class="card-title">Focus</div><p style="font-size:13px;color:var(--text2)">${escHtml(data.focus_recommendation)}</p></div>` : ''}
        ${tasks.length ? `<div class="card mb-12"><div class="card-title">Tasks for today</div><ul class="task-list">${tasks.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul></div>` : ''}
        ${news.length ? `<div class="card mb-12"><div class="card-title">News</div><ul class="task-list">${news.map(n => `<li>${escHtml(n)}</li>`).join('')}</ul></div>` : ''}
        <div class="card"><div class="card-title">System</div>
          <div class="stat-row"><span class="stat-label">Supabase status</span><span class="stat-val">✅ Connected</span></div>
          <div class="stat-row"><span class="stat-label">Requests processed</span><span class="stat-val">${processed.length}</span></div>
        </div>`
    } catch (e) {
      container.innerHTML = '<p class="error-state">Failed to load briefing.</p>'
    }
  }

  async function triggerMorningCoffee () {
    const btn = document.getElementById('trigger-morning-btn')
    const status = document.getElementById('morning-trigger-status')
    if (btn) btn.disabled = true
    try {
      const { error } = await window.sb.from('requests').insert({
        type: 'morning-coffee',
        status: 'pending',
        payload: { requested_by: 'dashboard', requested_at: new Date().toISOString() }
      })
      if (error) throw error
      if (status) status.textContent = '✓ Request queued — Claude Code will process this at next session start.'
    } catch (e) {
      if (status) status.textContent = 'Failed to queue request: ' + e.message
    } finally {
      if (btn) btn.disabled = false
    }
  }

  function escHtml (s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  const triggerBtn = document.getElementById('trigger-morning-btn')
  if (triggerBtn) triggerBtn.addEventListener('click', triggerMorningCoffee)

  loadMorningBriefing()
  window.morningRefresh = loadMorningBriefing
})()
