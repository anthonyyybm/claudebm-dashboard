// Production tab — weekly stats, color-coded chart, content calendar, monthly summary
;(function () {
  let chartInstance = null
  let viewYear, viewMonth
  let monthData  = []
  let recentData = []

  // ── PHT helpers ───────────────────────────────────────────────
  function todayPHT () {
    const now = new Date()
    const pht = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 8 * 3600000)
    return pht.toISOString().split('T')[0]
  }

  function weekStartPHT () {
    // Monday of current week in PHT
    const t = todayPHT()
    const d = new Date(t + 'T00:00:00')
    const day = d.getDay() // 0=Sun 1=Mon … 6=Sat
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    return d.toISOString().split('T')[0]
  }

  function pad (n) { return String(n).padStart(2, '0') }

  function initView () {
    const [y, m] = todayPHT().split('-')
    viewYear  = parseInt(y)
    viewMonth = parseInt(m)
  }

  // ── Data loading ──────────────────────────────────────────────
  async function loadAll () {
    await Promise.all([loadMonthData(), loadRecentData()])
  }

  async function loadRecentData () {
    // Last 14 days — covers cross-month boundary for chart + week stats
    const end   = todayPHT()
    const startD = new Date(end + 'T00:00:00')
    startD.setDate(startD.getDate() - 13)
    const start = startD.toISOString().split('T')[0]
    try {
      const { data, error } = await window.sb
        .from('production_log')
        .select('log_date, reels_completed, scripts_generated')
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date')
      if (error) throw error
      recentData = data || []
    } catch {
      recentData = []
    }
    renderWeekStats()
    renderWeekChart()
  }

  async function loadMonthData () {
    const start = `${viewYear}-${pad(viewMonth)}-01`
    const end   = `${viewYear}-${pad(viewMonth)}-31`
    const cal = document.getElementById('production-calendar')
    if (cal) cal.innerHTML = '<div class="skeleton" style="height:200px;border-radius:6px"></div>'
    try {
      const { data, error } = await window.sb
        .from('production_log')
        .select('log_date, reels_completed, reels_target, scripts_generated, notes')
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date')
      if (error) throw error
      monthData = data || []
    } catch {
      monthData = []
      if (cal) cal.innerHTML = '<p class="error-state">Failed to load production data.</p>'
      return
    }
    renderCalendar()
    renderMonthStats()
  }

  // ── Section 1 — Week stats ────────────────────────────────────
  function renderWeekStats () {
    const today  = todayPHT()
    const wStart = weekStartPHT()
    let reels = 0, targetDays = 0, scripts = 0
    recentData.forEach(r => {
      if (r.log_date >= wStart && r.log_date <= today) {
        reels      += r.reels_completed   || 0
        scripts    += r.scripts_generated || 0
        if ((r.reels_completed || 0) >= 3) targetDays++
      }
    })
    setText('prod-week-reels',   reels)
    setText('prod-week-target',  targetDays)
    setText('prod-week-scripts', scripts)
  }

  // ── Section 2 — Weekly chart ──────────────────────────────────
  function renderWeekChart () {
    const canvas = document.getElementById('weekly-chart')
    if (!canvas || typeof Chart === 'undefined') return
    const today = todayPHT()
    const labels = [], values = [], colors = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today + 'T00:00:00')
      d.setDate(d.getDate() - i)
      const ds  = d.toISOString().split('T')[0]
      const row = recentData.find(r => r.log_date === ds)
      const n   = row?.reels_completed ?? 0
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }))
      values.push(n)
      colors.push(n >= 3 ? '#1a7a4a' : n > 0 ? '#d97706' : '#c0392b')
    }

    if (chartInstance) { chartInstance.destroy(); chartInstance = null }

    const style  = getComputedStyle(document.documentElement)
    const text3  = style.getPropertyValue('--text3').trim()  || '#8aaa98'
    const text2  = style.getPropertyValue('--text2').trim()  || '#5a7a68'
    const border = style.getPropertyValue('--border').trim() || '#e0ece6'

    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Reels',
            data: values,
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: false,
            order: 1
          },
          {
            type: 'line',
            label: 'Daily target',
            data: Array(7).fill(3),
            borderColor: 'rgba(90,122,104,0.55)',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            tension: 0,
            order: 0
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              filter: item => item.text === 'Daily target',
              boxWidth: 24,
              boxHeight: 1,
              font: { size: 10 },
              color: text2
            }
          },
          tooltip: {
            filter: item => item.dataset.type === 'bar',
            callbacks: {
              label: ctx => ` ${ctx.parsed.y} reel${ctx.parsed.y !== 1 ? 's' : ''}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: 3,
            ticks: {
              stepSize: 1,
              callback: v => Number.isInteger(v) ? v : null,
              color: text3
            },
            grid: { color: border }
          },
          x: {
            ticks: { color: text2 },
            grid: { display: false }
          }
        }
      }
    })
  }

  // ── Section 3 — Content calendar ─────────────────────────────
  function renderCalendar () {
    const cal = document.getElementById('production-calendar')
    if (!cal) return

    const map = {}
    monthData.forEach(r => { map[r.log_date] = r })
    const today = todayPHT()

    const title = document.getElementById('production-month-title')
    if (title) {
      const monthName = new Date(viewYear, viewMonth - 1)
        .toLocaleString('en-US', { month: 'long', year: 'numeric' })
      title.textContent = `Content Calendar — ${monthName}`
    }

    const firstDay    = new Date(viewYear, viewMonth - 1, 1).getDay() // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
    const dayNames    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    let html = '<div class="calendar-grid">'
    // Day name header row
    html += dayNames.map(d => `<div class="calendar-header">${d}</div>`).join('')
    // Leading empty cells
    for (let i = 0; i < firstDay; i++) html += '<div class="calendar-cell empty"></div>'
    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const ds   = `${viewYear}-${pad(viewMonth)}-${pad(d)}`
      const row  = map[ds]
      const n    = row?.reels_completed ?? 0
      const colorCls = n >= 3 ? ' green' : n > 0 ? ' amber' : ''
      const todayCls = ds === today ? ' today' : ''
      const dotColor = n >= 3 ? 'var(--success)' : n > 0 ? 'var(--amber)' : 'var(--text3)'
      html += `<div class="calendar-cell has-data${colorCls}${todayCls}" onclick="window.showDayDetail('${ds}')">
        <span class="day-num">${d}</span>
        <div class="calendar-dot" style="background:${dotColor}"></div>
        ${n > 0 ? `<span class="reel-count">${n}</span>` : ''}
      </div>`
    }
    html += '</div>'
    cal.innerHTML = html
  }

  // ── Day detail modal ──────────────────────────────────────────
  window.showDayDetail = async function (date) {
    const existing = document.getElementById('day-modal-overlay')
    if (existing) existing.remove()

    const row = monthData.find(r => r.log_date === date)
    const [y, m, d] = date.split('-')
    const displayDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

    let badgeClass = 'gray', badgeText = 'No Data'
    if (row) {
      const n = row.reels_completed ?? 0
      const t = row.reels_target    ?? 3
      if (n >= t)   { badgeClass = 'green'; badgeText = 'Target Hit' }
      else if (n > 0) { badgeClass = 'amber'; badgeText = 'Partial' }
    }

    const overlay = document.createElement('div')
    overlay.id = 'day-modal-overlay'
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `<div class="modal-card" style="max-width:480px">
      <div class="modal-header" style="flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;gap:10px">
          <div class="modal-title">${displayDate}</div>
          <button class="modal-close" id="day-modal-close">✕</button>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="modal-body" id="day-modal-body">
        <div class="skeleton" style="height:80px;border-radius:6px"></div>
      </div>
      <div class="modal-footer">
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost" style="font-size:11px" onclick="window.goTab('scripts');document.getElementById('day-modal-overlay').remove()">Scripts →</button>
          <button class="btn btn-ghost" style="font-size:11px" onclick="window.goTab('morning');document.getElementById('day-modal-overlay').remove()">Morning →</button>
          <button class="btn btn-ghost" style="font-size:11px" onclick="window.goTab('eod');document.getElementById('day-modal-overlay').remove()">EOD →</button>
        </div>
        <button class="btn btn-ghost" style="font-size:11px" onclick="document.getElementById('day-modal-overlay').remove()">Close</button>
      </div>
    </div>`
    document.body.appendChild(overlay)

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    document.getElementById('day-modal-close').addEventListener('click', () => overlay.remove())

    if (!row) {
      document.getElementById('day-modal-body').innerHTML = `
        <div style="text-align:center;padding:28px 0">
          <div style="font-size:14px;font-weight:600;margin-bottom:6px;color:var(--text)">No data recorded for this day</div>
          <div class="text-sm text-muted">This day has not been logged yet.</div>
        </div>`
      return
    }

    // Fetch morning briefing, EOD summary, and scripts used this day
    let briefing = null, eod = null, scripts = []
    try {
      const [bRes, eRes, sRes] = await Promise.all([
        window.sb.from('morning_briefings')
          .select('briefing_date,focus_recommendation,raw_output')
          .eq('briefing_date', date).maybeSingle(),
        window.sb.from('eod_summaries')
          .select('summary_date,raw_output')
          .eq('summary_date', date).maybeSingle(),
        window.sb.from('scripts')
          .select('id,topic,used_at')
          .not('used_at', 'is', null)
          .gte('used_at', date + 'T00:00:00')
          .lte('used_at', date + 'T23:59:59')
      ])
      if (!bRes.error) briefing = bRes.data
      if (!eRes.error) eod     = eRes.data
      if (!sRes.error) scripts = sRes.data || []
    } catch {}

    const reels  = row.reels_completed ?? 0
    const target = row.reels_target    ?? 3
    const reelColor = reels >= target ? 'var(--success)' : reels > 0 ? 'var(--amber)' : 'var(--danger)'

    let html = ''

    // Production Summary section
    html += `<div class="modal-section">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);margin-bottom:8px">Production Summary</div>
      <div class="stat-row">
        <span class="stat-label">Reels completed</span>
        <span class="stat-val" style="color:${reelColor}">${reels} of ${target}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Scripts generated</span>
        <span class="stat-val">${row.scripts_generated ?? 0}</span>
      </div>`
    if (row.tasks_completed != null) {
      html += `<div class="stat-row"><span class="stat-label">Tasks completed</span><span class="stat-val">${row.tasks_completed}</span></div>`
    }
    if (row.tasks_rolled_over != null) {
      html += `<div class="stat-row"><span class="stat-label">Tasks rolled over</span><span class="stat-val">${row.tasks_rolled_over}</span></div>`
    }
    if (row.notes) {
      html += `<div class="stat-row" style="flex-direction:column;align-items:flex-start;gap:4px;border-bottom:none">
        <span class="stat-label">Notes</span>
        <span style="font-size:12px;color:var(--text2);white-space:pre-wrap">${escHtml(row.notes)}</span>
      </div>`
    }
    html += '</div>'

    // Morning Briefing section
    if (briefing) {
      const preview = briefing.focus_recommendation ||
        (briefing.raw_output ? briefing.raw_output.substring(0, 200) + (briefing.raw_output.length > 200 ? '…' : '') : '')
      html += `<div class="modal-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)">Morning Briefing</span>
          <a href="#" style="font-size:11px;color:var(--accent)" onclick="event.preventDefault();window.goTab('morning');document.getElementById('day-modal-overlay').remove()">View full briefing →</a>
        </div>
        ${preview ? `<div style="font-size:12px;color:var(--text2)">${escHtml(preview)}</div>` : '<div class="text-sm text-muted">No preview available.</div>'}
      </div>`
    }

    // EOD Summary section
    if (eod) {
      const raw     = eod.raw_output || ''
      const preview = raw.substring(0, 200) + (raw.length > 200 ? '…' : '')
      html += `<div class="modal-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)">EOD Summary</span>
          <a href="#" style="font-size:11px;color:var(--accent)" onclick="event.preventDefault();window.goTab('eod');document.getElementById('day-modal-overlay').remove()">View full EOD →</a>
        </div>
        ${preview ? `<div style="font-size:12px;color:var(--text2);white-space:pre-wrap">${escHtml(preview)}</div>` : '<div class="text-sm text-muted">No preview available.</div>'}
      </div>`
    }

    // Scripts used today section
    if (scripts.length > 0) {
      html += `<div class="modal-section">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);margin-bottom:8px">Scripts Used Today</div>
        <ul style="list-style:none;margin:0;padding:0">`
      scripts.forEach(s => {
        html += `<li style="padding:5px 0;border-bottom:1px solid var(--border);font-size:13px">
          <a href="#" style="color:var(--accent)" onclick="event.preventDefault();window.goTab('scripts');document.getElementById('day-modal-overlay').remove()">${escHtml(s.topic)}</a>
        </li>`
      })
      html += `</ul>
        <div style="margin-top:8px">
          <a href="#" style="font-size:11px;color:var(--accent)" onclick="event.preventDefault();window.goTab('scripts');document.getElementById('day-modal-overlay').remove()">View all scripts →</a>
        </div>
      </div>`
    }

    document.getElementById('day-modal-body').innerHTML = html || '<div class="text-sm text-muted">No details available.</div>'
  }

  // ── Section 4 — Monthly summary ───────────────────────────────
  function renderMonthStats () {
    const totalReels  = monthData.reduce((s, r) => s + (r.reels_completed || 0), 0)
    const targetDays  = monthData.filter(r => (r.reels_completed || 0) >= 3).length
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
    const monthName   = new Date(viewYear, viewMonth - 1)
      .toLocaleString('en-US', { month: 'long', year: 'numeric' })

    setText('prod-month-reels',  totalReels)
    setText('prod-month-label',  monthName)
    setText('prod-month-target', `${targetDays} of ${daysInMonth} days`)
  }

  // ── Month navigation ──────────────────────────────────────────
  function prevMonth () {
    viewMonth--
    if (viewMonth < 1) { viewMonth = 12; viewYear-- }
    clearDetail()
    loadMonthData()
  }

  function nextMonth () {
    viewMonth++
    if (viewMonth > 12) { viewMonth = 1; viewYear++ }
    clearDetail()
    loadMonthData()
  }

  function clearDetail () {
    const modal = document.getElementById('day-modal-overlay')
    if (modal) modal.remove()
  }

  // ── Utils ─────────────────────────────────────────────────────
  function setText (id, val) {
    const el = document.getElementById(id)
    if (el) el.textContent = val
  }

  function escHtml (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // ── Init ─────────────────────────────────────────────────────
  initView()
  document.getElementById('cal-prev')?.addEventListener('click', prevMonth)
  document.getElementById('cal-next')?.addEventListener('click', nextMonth)
  loadAll()
  window.productionRefresh = loadAll
})()
