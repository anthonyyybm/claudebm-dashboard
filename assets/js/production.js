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
        .order('log_date', { ascending: true })
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
    const end   = `${viewYear}-${pad(viewMonth)}-${pad(new Date(viewYear, viewMonth, 0).getDate())}`
    const cal = document.getElementById('production-calendar')
    if (cal) cal.innerHTML = '<div class="skeleton" style="height:200px;border-radius:6px"></div>'
    try {
      const { data, error } = await window.sb
        .from('production_log')
        .select('log_date, reels_completed, reels_target, scripts_generated, notes')
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date', { ascending: true })
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

  // ── Day plan modal ────────────────────────────────────────────
  window.showDayDetail = async function (date) {
    const existing = document.getElementById('day-modal-overlay')
    if (existing) existing.remove()

    const row = monthData.find(r => r.log_date === date)
    const [y, m, d] = date.split('-')
    const displayDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

    const today  = todayPHT()
    const isPast = date < today
    const isFuture = date > today

    let badgeClass = 'gray', badgeText = 'Not Logged'
    if (row) {
      const n = row.reels_completed ?? 0
      const t = row.reels_target    ?? 3
      if (n >= t)   { badgeClass = 'green'; badgeText = 'Target Hit' }
      else if (n > 0) { badgeClass = 'amber'; badgeText = 'Partial' }
      else            { badgeClass = 'gray';  badgeText = '0 Reels' }
    } else if (isFuture) {
      badgeClass = 'accent'; badgeText = 'Upcoming'
    }

    const overlay = document.createElement('div')
    overlay.id = 'day-modal-overlay'
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `<div class="modal-card" style="max-width:520px">
      <div class="modal-header" style="flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;gap:10px">
          <div class="modal-title">${displayDate}</div>
          <button class="modal-close" id="day-modal-close">✕</button>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="modal-body" id="day-modal-body">
        <div class="skeleton" style="height:120px;border-radius:6px"></div>
        <div class="skeleton mt-8" style="height:80px;border-radius:6px"></div>
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

    // ── Fetch all data in parallel ─────────────────────────────
    let briefing = null, eod = null, planned = [], used = [], ideas = []
    try {
      const [bRes, eRes, pRes, uRes, iRes] = await Promise.all([
        window.sb.from('morning_briefings')
          .select('briefing_date,focus_recommendation,raw_output')
          .eq('briefing_date', date).maybeSingle(),
        window.sb.from('eod_summaries')
          .select('summary_date,raw_output')
          .eq('summary_date', date).maybeSingle(),
        window.sb.from('scripts')
          .select('id,topic,series,status')
          .eq('planned_date', date)
          .order('plan_order', { ascending: true, nullsFirst: false }),
        window.sb.from('scripts')
          .select('id,topic,series,status')
          .not('used_at', 'is', null)
          .gte('used_at', date + 'T00:00:00')
          .lte('used_at', date + 'T23:59:59'),
        window.sb.from('content_ideas')
          .select('id,topic,angle,category')
          .eq('status', 'New')
          .order('created_at', { ascending: false })
          .limit(5)
      ])
      if (!bRes.error) briefing = bRes.data
      if (!eRes.error) eod      = eRes.data
      if (!pRes.error) planned  = pRes.data || []
      if (!uRes.error) used     = uRes.data || []
      if (!iRes.error) ideas    = iRes.data || []
    } catch {}

    // ── Build modal body ───────────────────────────────────────
    let html = ''

    // 1. Morning Focus (if exists) — full-width accent card at top
    if (briefing?.focus_recommendation) {
      html += `<div class="day-plan-section" style="padding-top:0">
        <div class="day-plan-heading">
          <span>Today's Focus</span>
          <a href="#" style="font-size:11px;color:var(--accent);text-transform:none;letter-spacing:0;font-weight:400"
             onclick="event.preventDefault();window.goTab('morning');document.getElementById('day-modal-overlay').remove()">Full briefing →</a>
        </div>
        <div class="day-plan-focus">${escHtml(briefing.focus_recommendation)}</div>
      </div>`
    }

    // 2. Scripts — planned vs used, two columns
    html += `<div class="day-plan-section">
      <div class="day-plan-heading">
        <span>Scripts</span>
        <a href="#" style="font-size:11px;color:var(--accent);text-transform:none;letter-spacing:0;font-weight:400"
           onclick="event.preventDefault();window.goTab('scripts');document.getElementById('day-modal-overlay').remove()">View all →</a>
      </div>
      <div class="day-plan-scripts-cols">`

    // Planned column
    html += `<div>
      <div class="day-plan-col-title">Planned (${planned.length})</div>`
    if (planned.length > 0) {
      html += `<div class="day-plan-list">`
      planned.forEach(s => {
        const dotColor = s.status === 'Ready' ? 'var(--success)' : s.status === 'Flagged' ? 'var(--danger)' : 'var(--amber)'
        const badgeCls = s.status === 'Ready' ? 'green' : s.status === 'Flagged' ? 'red' : 'amber'
        html += `<div class="day-plan-script-row">
          <div class="day-plan-dot" style="background:${dotColor}"></div>
          <div style="flex:1;min-width:0;overflow:hidden">
            <div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(s.topic)}</div>
            ${s.series ? `<div style="font-size:10px;color:var(--text3)">${escHtml(s.series)}</div>` : ''}
          </div>
          <span class="badge ${badgeCls}" style="flex-shrink:0;font-size:9px">${s.status}</span>
        </div>`
      })
      html += `</div>`
    } else {
      html += `<div class="day-plan-empty">No scripts planned.<br>
        <span style="font-size:10px">Set <code style="font-size:10px;background:var(--surface2);padding:1px 4px;border-radius:3px">planned_date</code> on a script to schedule it here.</span>
      </div>`
    }
    html += `</div>`

    // Used column
    html += `<div>
      <div class="day-plan-col-title">Used (${used.length})</div>`
    if (used.length > 0) {
      html += `<div class="day-plan-list">`
      used.forEach(s => {
        html += `<div class="day-plan-script-row">
          <div style="color:var(--success);font-size:14px;line-height:1;flex-shrink:0">✓</div>
          <div style="flex:1;min-width:0;overflow:hidden">
            <div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(s.topic)}</div>
            ${s.series ? `<div style="font-size:10px;color:var(--text3)">${escHtml(s.series)}</div>` : ''}
          </div>
        </div>`
      })
      html += `</div>`
    } else {
      html += `<div class="day-plan-empty">${isPast ? 'None recorded.' : 'None yet.'}</div>`
    }
    html += `</div>`

    html += `</div></div>` // close cols + section

    // 3. Production stats
    if (row) {
      const reels  = row.reels_completed ?? 0
      const target = row.reels_target    ?? 3
      const reelColor = reels >= target ? 'var(--success)' : reels > 0 ? 'var(--amber)' : 'var(--danger)'
      html += `<div class="day-plan-section">
        <div class="day-plan-heading"><span>Production</span></div>
        <div class="day-plan-stat-grid">
          <div class="day-plan-stat">
            <div class="day-plan-stat-val" style="color:${reelColor}">${reels}/${target}</div>
            <div class="day-plan-stat-label">Reels</div>
          </div>
          <div class="day-plan-stat">
            <div class="day-plan-stat-val">${row.scripts_generated ?? 0}</div>
            <div class="day-plan-stat-label">Scripts Generated</div>
          </div>
        </div>
        ${row.notes ? `<div class="day-plan-notes">${escHtml(row.notes)}</div>` : ''}
      </div>`
    } else if (!isFuture) {
      html += `<div class="day-plan-section">
        <div class="day-plan-heading"><span>Production</span></div>
        <div class="day-plan-empty">Not logged for this day.</div>
      </div>`
    }

    // 4. Ideas bank
    if (ideas.length > 0) {
      html += `<div class="day-plan-section">
        <div class="day-plan-heading">
          <span>Ideas Bank <span class="day-plan-count">(New)</span></span>
          <a href="#" style="font-size:11px;color:var(--accent);text-transform:none;letter-spacing:0;font-weight:400"
             onclick="event.preventDefault();window.goTab('ideas');document.getElementById('day-modal-overlay').remove()">View all →</a>
        </div>`
      ideas.forEach(idea => {
        html += `<div class="day-plan-idea-card">
          <div class="day-plan-idea-topic">${escHtml(idea.topic)}</div>
          ${idea.angle ? `<div class="day-plan-idea-angle">${escHtml(idea.angle)}</div>` : ''}
        </div>`
      })
      html += `</div>`
    }

    // 5. EOD summary (bottom, muted — past days only)
    if (eod) {
      const raw     = eod.raw_output || ''
      const preview = raw.substring(0, 220) + (raw.length > 220 ? '…' : '')
      html += `<div class="day-plan-section">
        <div class="day-plan-heading">
          <span>EOD Summary</span>
          <a href="#" style="font-size:11px;color:var(--accent);text-transform:none;letter-spacing:0;font-weight:400"
             onclick="event.preventDefault();window.goTab('eod');document.getElementById('day-modal-overlay').remove()">View full →</a>
        </div>
        <div class="day-plan-preview">${escHtml(preview)}</div>
      </div>`
    }

    document.getElementById('day-modal-body').innerHTML = html
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
