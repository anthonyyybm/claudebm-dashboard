// Scripts tab — pipeline table, filters, detail panel, status updates
;(function () {
  let allScripts = []
  let activeFilter = 'All'
  let searchQuery = ''
  let expandedId = null

  const STATUS_COLOR = { Ready: 'green', Draft: 'amber', Used: 'gray', Flagged: 'red' }
  const CC_COLOR = { Passed: 'green', Flagged: 'red' }

  async function loadScripts () {
    const table = document.getElementById('scripts-table-body')
    if (!table) return
    table.innerHTML = '<tr><td colspan="10"><div class="skeleton"></div></td></tr>'
    try {
      const { data, error } = await window.sb
        .from('scripts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      allScripts = data || []
      renderTable()
    } catch (e) {
      table.innerHTML = '<tr><td colspan="10" class="error-state">Failed to load scripts.</td></tr>'
    }
  }

  function renderTable () {
    const table = document.getElementById('scripts-table-body')
    if (!table) return
    let rows = allScripts
    if (activeFilter !== 'All') rows = rows.filter(s => s.status === activeFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(s => (s.topic || '').toLowerCase().includes(q) || (s.series || '').toLowerCase().includes(q))
    }
    if (rows.length === 0) {
      table.innerHTML = '<tr><td colspan="10" class="text-muted text-sm" style="padding:16px">No scripts match this filter.</td></tr>'
      return
    }
    table.innerHTML = rows.map(s => `
      <tr class="script-table-row" data-id="${s.id}" onclick="window.scriptsToggleDetail('${s.id}')">
        <td class="script-topic" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.topic || '—'}</td>
        <td class="text-xs text-muted">${abbreviateSeries(s.series)}</td>
        <td><span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span></td>
        <td><span class="badge ${CC_COLOR[s.consistency_check] || 'gray'}">${s.consistency_check || '—'}</span></td>
        <td>${dot(s.image_prompt)}</td>
        <td>${dot(s.video_prompt_p1)}</td>
        <td>${dot(s.video_prompt_p2)}</td>
        <td>${dot(s.cta_prompt)}</td>
        <td>${dot(s.caption_tiktok)}</td>
        <td class="text-xs text-muted">${s.created_at ? s.created_at.slice(0,10) : '—'}</td>
      </tr>
      <tr id="detail-${s.id}" class="detail-row" style="display:none">
        <td colspan="10">
          <div class="detail-panel open animate-in">
            <div style="display:flex;gap:8px;margin-bottom:12px">
              ${s.status !== 'Ready' ? `<button class="btn" onclick="window.markReady('${s.id}');event.stopPropagation()">Mark Ready</button>` : ''}
              ${s.status !== 'Used' ? `<button class="btn-ghost btn" onclick="window.markUsed('${s.id}');event.stopPropagation()">Mark Used</button>` : ''}
            </div>
            ${field('Series', s.series)}
            ${field('Hook', s.hook)}
            ${field('Script Part 1', s.script_part1)}
            ${field('Script Part 2', s.script_part2)}
            ${field('Image Prompt', s.image_prompt)}
            ${field('Video Prompt P1', s.video_prompt_p1)}
            ${field('Video Prompt P2', s.video_prompt_p2)}
            ${s.cta_prompt ? field('CTA Prompt', s.cta_prompt) : ''}
            ${field('Caption TikTok', s.caption_tiktok)}
            ${field('Caption Instagram', s.caption_instagram)}
            ${s.consistency_flags ? field('Consistency Flags', JSON.stringify(s.consistency_flags, null, 2)) : ''}
          </div>
        </td>
      </tr>`).join('')
  }

  function dot (val) {
    return `<span class="dot ${val ? 'accent' : 'gray'}"></span>`
  }

  function field (label, val) {
    if (!val) return ''
    return `<div class="detail-field">
      <div class="detail-label">${label}</div>
      <div class="detail-text">${escHtml(val)}</div>
    </div>`
  }

  function escHtml (s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  function abbreviateSeries (s) {
    if (!s) return '—'
    if (s.includes('Marketing')) return 'Marketing'
    if (s.includes('Sales')) return 'Sales'
    if (s.includes('Customer')) return 'Cx Gaps'
    return s.slice(0,14)
  }

  window.scriptsToggleDetail = function (id) {
    const row = document.getElementById(`detail-${id}`)
    if (!row) return
    if (expandedId && expandedId !== id) {
      const prev = document.getElementById(`detail-${expandedId}`)
      if (prev) prev.style.display = 'none'
    }
    const isOpen = row.style.display !== 'none'
    row.style.display = isOpen ? 'none' : 'table-row'
    expandedId = isOpen ? null : id
  }

  window.markReady = async function (id) {
    await window.sb.from('scripts').update({ status: 'Ready' }).eq('id', id)
    await loadScripts()
  }

  window.markUsed = async function (id) {
    await window.sb.from('scripts').update({ status: 'Used', used_at: new Date().toISOString() }).eq('id', id)
    await loadScripts()
  }

  // Filter buttons
  document.querySelectorAll('[data-scripts-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.scriptsFilter
      document.querySelectorAll('[data-scripts-filter]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderTable()
    })
  })

  // Search
  const searchEl = document.getElementById('scripts-search')
  if (searchEl) {
    searchEl.addEventListener('input', e => {
      searchQuery = e.target.value.trim()
      renderTable()
    })
  }

  loadScripts()
  window.scriptsRefresh = loadScripts
})()
