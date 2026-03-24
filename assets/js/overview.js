// Overview tab — metrics, script preview, briefing preview
;(function () {
  const PHT_OFFSET = 8 * 60 // UTC+8

  function todayPHT () {
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const pht = new Date(utc + PHT_OFFSET * 60000)
    return pht.toISOString().split('T')[0]
  }

  async function loadScriptsReady () {
    try {
      const { data, error } = await window.sb
        .from('scripts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Ready')
      if (error) throw error
      const count = data === null ? 0 : (Array.isArray(data) ? data.length : 0)
      const el = document.getElementById('metric-scripts-ready')
      if (!el) return
      el.textContent = count
      el.closest('.metric-card').classList.toggle('alert', count === 0)
      el.closest('.metric-card').classList.toggle('good', count >= 3)
    } catch (e) {
      const el = document.getElementById('metric-scripts-ready')
      if (el) el.textContent = '—'
    }
  }

  async function loadReelsToday () {
    try {
      const today = todayPHT()
      const { data, error } = await window.sb
        .from('production_log')
        .select('reels_completed')
        .eq('log_date', today)
        .maybeSingle()
      if (error) throw error
      const count = data?.reels_completed ?? 0
      const el = document.getElementById('metric-reels-today')
      if (el) el.textContent = `${count}/3`
      el?.closest('.metric-card').classList.toggle('good', count >= 3)
      el?.closest('.metric-card').classList.toggle('amber', count > 0 && count < 3)

      // Progress bar
      const bar = document.getElementById('reel-progress-bar')
      if (bar) bar.style.width = `${Math.min(100, (count / 3) * 100)}%`
      const barLabel = document.getElementById('reel-progress-label')
      if (barLabel) barLabel.textContent = `${count} / 3 reels completed today`
    } catch (e) {
      const el = document.getElementById('metric-reels-today')
      if (el) el.textContent = '—'
    }
  }

  async function loadIdeasCount () {
    try {
      const { data, error } = await window.sb
        .from('content_ideas')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'New')
      if (error) throw error
      const el = document.getElementById('metric-ideas')
      if (el) el.textContent = Array.isArray(data) ? data.length : 0
    } catch (e) {
      const el = document.getElementById('metric-ideas')
      if (el) el.textContent = '—'
    }
  }

  async function loadStreak () {
    try {
      const { data, error } = await window.sb
        .from('production_log')
        .select('log_date, reels_completed')
        .order('log_date', { ascending: false })
        .limit(60)
      if (error || !data) throw error
      let streak = 0
      const today = todayPHT()
      const sorted = data.sort((a, b) => b.log_date.localeCompare(a.log_date))
      for (const row of sorted) {
        if (row.reels_completed >= 1) streak++
        else break
      }
      const el = document.getElementById('metric-streak')
      if (el) {
        el.textContent = streak
        el.closest('.metric-card').classList.toggle('good', streak >= 3)
      }
      const sub = document.getElementById('metric-streak-sub')
      if (sub) sub.textContent = streak === 1 ? 'day' : 'days'
    } catch (e) {
      const el = document.getElementById('metric-streak')
      if (el) el.textContent = '—'
    }
  }

  async function loadScriptPreview () {
    const container = document.getElementById('script-preview-list')
    if (!container) return
    try {
      const { data, error } = await window.sb
        .from('scripts')
        .select('id, topic, series, status, consistency_check')
        .order('created_at', { ascending: false })
        .limit(8)
      if (error) throw error
      if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-muted text-sm">No scripts yet.</p>'
        return
      }
      container.innerHTML = data.map(s => {
        const statusColor = { Ready: 'green', Draft: 'amber', Used: 'gray', Flagged: 'red' }[s.status] || 'gray'
        return `<div class="script-row" onclick="window.goTab('scripts')">
          <span class="dot ${statusColor}"></span>
          <span class="script-topic">${s.topic || '(untitled)'}</span>
          <span class="script-series text-xs text-muted">${abbreviateSeries(s.series)}</span>
          <span class="badge ${statusColor}">${s.status}</span>
        </div>`
      }).join('')
    } catch (e) {
      container.innerHTML = '<p class="error-state">Failed to load scripts.</p>'
    }
  }

  async function loadBriefingPreview () {
    const container = document.getElementById('briefing-preview')
    if (!container) return
    try {
      const { data, error } = await window.sb
        .from('morning_briefings')
        .select('briefing_date, scripts_ready, focus_recommendation')
        .order('briefing_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        container.innerHTML = '<p class="text-muted text-sm">No briefings yet.</p>'
        return
      }
      container.innerHTML = `
        <div class="stat-row"><span class="stat-label">Date</span><span class="stat-val">${data.briefing_date}</span></div>
        <div class="stat-row"><span class="stat-label">Scripts ready</span><span class="stat-val">${data.scripts_ready ?? '—'}</span></div>
        <div style="margin-top:10px;font-size:13px;color:var(--text2);line-height:1.5">${data.focus_recommendation || ''}</div>
        <div class="mt-8"><a href="#" onclick="window.goTab('morning');return false" class="text-sm" style="color:var(--accent)">View full briefing →</a></div>`
    } catch (e) {
      container.innerHTML = '<p class="error-state">Failed to load briefing.</p>'
    }
  }

  function abbreviateSeries (s) {
    if (!s) return ''
    if (s.includes('Marketing')) return 'Marketing'
    if (s.includes('Sales')) return 'Sales'
    if (s.includes('Customer')) return 'Cx'
    return s.slice(0, 12)
  }

  async function loadAll () {
    await Promise.allSettled([
      loadScriptsReady(),
      loadReelsToday(),
      loadIdeasCount(),
      loadStreak(),
      loadScriptPreview(),
      loadBriefingPreview()
    ])
  }

  // Auto-refresh every 60 seconds
  loadAll()
  setInterval(loadAll, 60000)
  window.overviewRefresh = loadAll
})()
