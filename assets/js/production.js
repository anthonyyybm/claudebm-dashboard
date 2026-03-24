// Production tab — calendar, weekly bar chart
;(function () {
  let chartInstance = null

  function todayStr () {
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const pht = new Date(utc + 8 * 3600000)
    return pht.toISOString().split('T')[0]
  }

  function currentYearMonth () {
    const [y, m] = todayStr().split('-')
    return { year: parseInt(y), month: parseInt(m) }
  }

  async function loadProductionData () {
    const { year, month } = currentYearMonth()
    const start = `${year}-${String(month).padStart(2,'0')}-01`
    const end   = `${year}-${String(month).padStart(2,'0')}-31`
    try {
      const { data, error } = await window.sb
        .from('production_log')
        .select('log_date, reels_completed, scripts_generated')
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date')
      if (error) throw error
      renderCalendar(data || [], year, month)
      renderWeekChart(data || [])
      renderWeekStats(data || [])
    } catch (e) {
      const cal = document.getElementById('production-calendar')
      if (cal) cal.innerHTML = '<p class="error-state">Failed to load production data.</p>'
    }
  }

  function renderCalendar (data, year, month) {
    const cal = document.getElementById('production-calendar')
    if (!cal) return
    const map = {}
    data.forEach(r => { map[r.log_date] = r })
    const today = todayStr()
    const firstDay = new Date(year, month - 1, 1).getDay()
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

    let html = '<div class="cal-grid">'
    html += days.map(d => `<div class="cal-day-name">${d}</div>`).join('')
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>'
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const row = map[ds]
      const reels = row?.reels_completed ?? 0
      let cls = ''
      if (reels >= 3) cls = 'has-reels-full'
      else if (reels > 0) cls = 'has-reels-part'
      const isToday = ds === today ? 'today' : ''
      const dotColor = reels >= 3 ? 'var(--success)' : reels > 0 ? 'var(--amber)' : 'transparent'
      html += `<div class="cal-day ${cls} ${isToday}" title="${ds}: ${reels} reels" onclick="window.showDayDetail('${ds}', ${reels})">
        <span class="cal-day-num">${d}</span>
        <div class="cal-day-dot" style="background:${dotColor}"></div>
      </div>`
    }
    html += '</div>'

    const title = document.getElementById('production-month-title')
    if (title) title.textContent = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
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

  window.showDayDetail = function (date, reels) {
    const panel = document.getElementById('day-detail-panel')
    if (!panel) return
    panel.innerHTML = `<div class="card animate-in mt-12">
      <div class="card-title">${date}</div>
      <div class="stat-row"><span class="stat-label">Reels completed</span><span class="stat-val ${reels>=3?'good':reels>0?'amber':''}">${reels}</span></div>
    </div>`
  }

  loadProductionData()
  window.productionRefresh = loadProductionData
})()
