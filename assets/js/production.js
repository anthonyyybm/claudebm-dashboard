// Production tab — calendar with navigation, weekly bar chart
;(function () {
  let chartInstance = null
  let viewYear, viewMonth
  let cachedData = []

  function todayStr () {
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const pht = new Date(utc + 8 * 3600000)
    return pht.toISOString().split('T')[0]
  }

  function initView () {
    const [y, m] = todayStr().split('-')
    viewYear = parseInt(y)
    viewMonth = parseInt(m)
  }

  async function loadProductionData () {
    const start = `${viewYear}-${String(viewMonth).padStart(2,'0')}-01`
    const end   = `${viewYear}-${String(viewMonth).padStart(2,'0')}-31`
    try {
      const { data, error } = await window.sb
        .from('production_log')
        .select('log_date, reels_completed, reels_target, scripts_generated, notes')
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date')
      if (error) throw error
      cachedData = data || []
      renderCalendar(cachedData)
      renderWeekChart(cachedData)
      renderWeekStats(cachedData)
    } catch (e) {
      const cal = document.getElementById('production-calendar')
      if (cal) cal.innerHTML = '<p class="error-state">Failed to load production data.</p>'
    }
  }

  function renderCalendar (data) {
    const cal = document.getElementById('production-calendar')
    if (!cal) return
    const map = {}
    data.forEach(r => { map[r.log_date] = r })
    const today = todayStr()
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

    const title = document.getElementById('production-month-title')
    if (title) title.textContent = new Date(viewYear, viewMonth - 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' })

    let html = '<div class="calendar-grid">'
    html += dayNames.map(d => `<div class="calendar-header">${d}</div>`).join('')
    for (let i = 0; i < firstDay; i++) html += '<div class="calendar-cell empty"></div>'
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${viewYear}-${String(viewMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const row = map[ds]
      const reels = row?.reels_completed ?? 0
      const colorCls = reels >= 3 ? ' green' : reels > 0 ? ' amber' : ''
      const todayCls = ds === today ? ' today' : ''
      const hasDataCls = row ? ' has-data' : ''
      const dotColor = reels >= 3 ? 'var(--success)' : reels > 0 ? 'var(--amber)' : 'var(--border)'
      html += `<div class="calendar-cell${colorCls}${todayCls}${hasDataCls}" onclick="window.showDayDetail('${ds}')">
        <span class="day-num">${d}</span>
        <div class="calendar-dot" style="background:${dotColor}"></div>
        ${reels > 0 ? `<span class="reel-count">${reels}</span>` : ''}
      </div>`
    }
    html += '</div>'
    cal.innerHTML = html
  }

  function renderWeekChart (data) {
    const canvas = document.getElementById('weekly-chart')
    if (!canvas || typeof Chart === 'undefined') return
    const today = new Date(todayStr())
    const labels = [], values = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const row = data.find(r => r.log_date === ds)
      labels.push(d.toLocaleDateString('default', { weekday: 'short' }))
      values.push(row?.reels_completed ?? 0)
    }
    if (chartInstance) chartInstance.destroy()
    const style = getComputedStyle(document.body)
    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Reels completed',
          data: values,
          backgroundColor: style.getPropertyValue('--accent').trim(),
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            max: 5,
            ticks: { stepSize: 1, color: style.getPropertyValue('--text3').trim() },
            grid: { color: style.getPropertyValue('--border').trim() }
          },
          x: { ticks: { color: style.getPropertyValue('--text2').trim() }, grid: { display: false } }
        }
      }
    })
  }

  function renderWeekStats (data) {
    const today = new Date(todayStr())
    let totalReels = 0, targetDays = 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const row = data.find(r => r.log_date === ds)
      const reels = row?.reels_completed ?? 0
      totalReels += reels
      if (reels >= 3) targetDays++
    }
    const el1 = document.getElementById('week-total-reels')
    if (el1) el1.textContent = totalReels
    const el2 = document.getElementById('week-target-days')
    if (el2) el2.textContent = `${targetDays}/7`
  }

  function escHtml (s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  window.showDayDetail = function (date) {
    const panel = document.getElementById('day-detail-panel')
    if (!panel) return
    const row = cachedData.find(r => r.log_date === date)
    if (!row) {
      panel.innerHTML = `<div class="calendar-detail"><span class="text-muted text-sm">No data for ${date}</span></div>`
      return
    }
    const reels = row.reels_completed ?? 0
    const target = row.reels_target ?? 3
    const reelColor = reels >= 3 ? 'var(--success)' : reels > 0 ? 'var(--amber)' : 'var(--text)'
    panel.innerHTML = `<div class="calendar-detail">
      <div class="stat-row"><span class="stat-label">Date</span><span class="stat-val">${date}</span></div>
      <div class="stat-row">
        <span class="stat-label">Reels completed</span>
        <span class="stat-val" style="color:${reelColor}">${reels} / ${target}</span>
      </div>
      <div class="stat-row"><span class="stat-label">Scripts generated</span><span class="stat-val">${row.scripts_generated ?? 0}</span></div>
      ${row.notes ? `<div class="stat-row" style="flex-direction:column;align-items:flex-start;gap:4px">
        <span class="stat-label">Notes</span>
        <span style="font-size:12px;color:var(--text2);white-space:pre-wrap">${escHtml(row.notes)}</span>
      </div>` : ''}
    </div>`
  }

  function prevMonth () {
    viewMonth--
    if (viewMonth < 1) { viewMonth = 12; viewYear-- }
    const p = document.getElementById('day-detail-panel')
    if (p) p.innerHTML = ''
    loadProductionData()
  }

  function nextMonth () {
    viewMonth++
    if (viewMonth > 12) { viewMonth = 1; viewYear++ }
    const p = document.getElementById('day-detail-panel')
    if (p) p.innerHTML = ''
    loadProductionData()
  }

  initView()

  const prevBtn = document.getElementById('cal-prev')
  const nextBtn = document.getElementById('cal-next')
  if (prevBtn) prevBtn.addEventListener('click', prevMonth)
  if (nextBtn) nextBtn.addEventListener('click', nextMonth)

  loadProductionData()
  window.productionRefresh = loadProductionData
})()
