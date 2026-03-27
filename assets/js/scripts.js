// Scripts tab — pagination, modal, copy buttons, filters
;(function () {
  let allScripts = []
  let activeFilter = 'All'
  let searchQuery = ''
  let currentPage = 1
  let pageSize = 10

  const STATUS_COLOR = { Ready: 'green', Draft: 'amber', Used: 'gray', Flagged: 'red' }

  // ── Inject modal HTML once ──────────────────────────────────
  document.body.insertAdjacentHTML('beforeend', `
<div id="script-modal-overlay" class="modal-overlay" style="display:none" onclick="window.closeScriptModal()">
  <div class="modal-card" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div style="flex:1;min-width:0">
        <div class="modal-title" id="modal-title"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px" id="modal-badges"></div>
      </div>
      <button class="modal-close" onclick="window.closeScriptModal()">&#x2715;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-footer" id="modal-footer"></div>
  </div>
</div>`)

  // ── Load ─────────────────────────────────────────────────────
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
      currentPage = 1
      renderTable()
    } catch {
      table.innerHTML = '<tr><td colspan="10" class="error-state">Failed to load scripts.</td></tr>'
    }
  }

  // ── Filter ────────────────────────────────────────────────────
  function getFiltered () {
    let rows = allScripts
    if (activeFilter !== 'All') {
      if (activeFilter === 'Flagged') rows = rows.filter(s => s.consistency_check === 'Flagged')
      else rows = rows.filter(s => s.status === activeFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(s =>
        (s.topic || '').toLowerCase().includes(q) ||
        (s.series || '').toLowerCase().includes(q)
      )
    }
    return rows
  }

  // ── Render table ──────────────────────────────────────────────
  function renderTable () {
    const table = document.getElementById('scripts-table-body')
    if (!table) return
    const filtered = getFiltered()
    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    if (currentPage > totalPages) currentPage = totalPages
    const start = (currentPage - 1) * pageSize
    const page = filtered.slice(start, start + pageSize)

    const countEl = document.getElementById('scripts-count')
    if (countEl) {
      countEl.textContent = total === 0
        ? 'No scripts match'
        : `Showing ${start + 1}–${Math.min(start + pageSize, total)} of ${total} scripts`
    }

    if (page.length === 0) {
      table.innerHTML = '<tr><td colspan="10" class="text-muted text-sm" style="padding:16px">No scripts match this filter.</td></tr>'
      renderPagination(0, 0)
      return
    }

    table.innerHTML = page.map(s => `
      <tr class="script-table-row" data-id="${s.id}" style="cursor:pointer" onclick="window.openScriptModal('${s.id}')">
        <td class="script-topic" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.topic || '—')}</td>
        <td class="text-xs text-muted">${abbreviateSeries(s.series)}</td>
        <td><span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span></td>
        <td>${ccBadge(s.consistency_check)}</td>
        <td>${dot(s.image_prompt)}</td>
        <td>${dot(s.video_prompt_p1)}</td>
        <td>${dot(s.video_prompt_p2)}</td>
        <td>${dot(s.cta_prompt)}</td>
        <td>${dot(s.caption_tiktok)}</td>
        <td class="text-xs text-muted">${s.created_at ? s.created_at.slice(0,10) : '—'}</td>
      </tr>`).join('')

    renderPagination(total, totalPages)
  }

  // ── Pagination ────────────────────────────────────────────────
  function renderPagination (total, totalPages) {
    const wrap = document.getElementById('scripts-pagination')
    if (!wrap) return
    if (total === 0) { wrap.innerHTML = ''; return }
    const isMobile = window.innerWidth < 600
    let pageNums = ''
    if (!isMobile && totalPages <= 20) {
      for (let i = 1; i <= totalPages; i++) {
        pageNums += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="window.scriptsGoPage(${i})">${i}</button>`
      }
    } else if (!isMobile) {
      pageNums = `<span class="text-xs text-muted" style="padding:0 6px">Page ${currentPage} of ${totalPages}</span>`
    }
    wrap.innerHTML = `
      <div class="pagination-row">
        <div class="pagination-controls">
          <button class="page-btn" onclick="window.scriptsGoPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>Previous</button>
          ${pageNums}
          <button class="page-btn" onclick="window.scriptsGoPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
        </div>
        <div style="display:flex;align-items:center;gap:5px">
          <span class="text-xs text-muted">Per page:</span>
          ${[10,25,50].map(n => `<button class="page-btn${pageSize === n ? ' active' : ''}" onclick="window.scriptsSetPageSize(${n})">${n}</button>`).join('')}
        </div>
      </div>`
  }

  window.scriptsGoPage = function (p) {
    const filtered = getFiltered()
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    if (p < 1 || p > totalPages) return
    currentPage = p
    renderTable()
    const card = document.querySelector('#tab-scripts .card')
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  window.scriptsSetPageSize = function (n) {
    pageSize = n
    currentPage = 1
    renderTable()
  }

  // ── Modal ──────────────────────────────────────────────────
  window.openScriptModal = function (id) {
    const s = allScripts.find(x => x.id === id)
    if (!s) return
    const overlay  = document.getElementById('script-modal-overlay')
    const titleEl  = document.getElementById('modal-title')
    const badgesEl = document.getElementById('modal-badges')
    const bodyEl   = document.getElementById('modal-body')
    const footerEl = document.getElementById('modal-footer')

    titleEl.textContent = s.topic || '—'
    badgesEl.innerHTML = `
      <span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span>
      <span class="badge gray">${abbreviateSeries(s.series)}</span>
      ${ccBadge(s.consistency_check)}`

    bodyEl.innerHTML = [
      modalField('Hook', s.hook),
      modalField('Script Part 1', s.script_part1),
      modalField('Script Part 2', s.script_part2),
      modalField('Image Prompt', s.image_prompt),
      modalField('Video Prompt P1', s.video_prompt_p1),
      modalField('Video Prompt P2', s.video_prompt_p2),
      s.cta_prompt ? modalField('CTA Prompt', s.cta_prompt) : '',
      modalField('Caption — TikTok', s.caption_tiktok),
      modalField('Caption — Instagram', s.caption_instagram),
      consistencySection(s)
    ].join('')

    footerEl.innerHTML = `
      <div style="display:flex;gap:8px">
        ${s.status !== 'Ready' ? `<button class="btn" onclick="window.markReady('${s.id}')">Mark Ready</button>` : ''}
        ${s.status !== 'Used'  ? `<button class="btn btn-ghost" onclick="window.markUsed('${s.id}')">Mark Used</button>` : ''}
      </div>
      <div class="text-xs text-muted">${s.created_at ? s.created_at.slice(0,10) : ''}</div>`

    overlay.style.display = 'flex'
    document.body.style.overflow = 'hidden'
  }

  window.closeScriptModal = function () {
    const overlay = document.getElementById('script-modal-overlay')
    if (overlay) overlay.style.display = 'none'
    document.body.style.overflow = ''
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeScriptModal() })

  function modalField (label, val) {
    if (!val) return ''
    const uid = 'mf' + Math.random().toString(36).slice(2, 9)
    return `<div class="modal-section">
      <div class="modal-section-header">
        <div class="detail-label">${label}</div>
        <button class="copy-btn" onclick="window.copyField('${uid}', this)">Copy</button>
      </div>
      <div class="detail-text" id="${uid}">${escHtml(val)}</div>
    </div>`
  }

  window.copyField = function (id, btn) {
    const el = document.getElementById(id)
    if (!el) return
    navigator.clipboard.writeText(el.textContent).then(() => {
      btn.textContent = 'Copied!'
      btn.classList.add('copied')
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied') }, 2000)
    }).catch(() => {})
  }

  // ── Helpers ─────────────────────────────────────────────────
  function ccBadge (cc) {
    if (cc === 'Passed')  return '<span class="badge green">&#x2713; Pass</span>'
    if (cc === 'Flagged') return '<span class="badge red">&#x26a0; Flag</span>'
    return '<span class="badge gray">—</span>'
  }

  function consistencySection (s) {
    const cc = s.consistency_check || 'Pending'
    if (cc === 'Passed') return `<div class="modal-section">
      <div class="detail-label">Consistency</div>
      <div style="color:var(--success);font-size:12px;padding:6px 0">&#x2713; Passed all checks</div>
    </div>`
    if (cc === 'Flagged') {
      const flags = s.consistency_flags
      let arr = Array.isArray(flags) ? flags : flags && typeof flags === 'object' ? Object.values(flags) : flags ? [String(flags)] : []
      return `<div class="modal-section">
        <div class="detail-label">Consistency</div>
        <div style="color:var(--danger);font-size:12px;font-weight:600;margin-bottom:6px">&#x26a0; Issues found</div>
        ${arr.map(f => `<div style="font-size:11px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">• ${escHtml(String(f))}</div>`).join('')}
      </div>`
    }
    return `<div class="modal-section">
      <div class="detail-label">Consistency</div>
      <div style="display:flex;align-items:center;gap:10px;padding:4px 0">
        <span style="font-size:12px;color:var(--text3)">Not checked yet</span>
        <button class="btn" style="font-size:11px;padding:3px 10px" id="run-check-${s.id}" onclick="window.queueConsistencyCheck('${s.id}')">Run Check</button>
      </div>
      <span id="check-status-${s.id}" class="text-xs text-muted"></span>
    </div>`
  }

  function dot (val) {
    return `<span class="dot ${val ? 'accent' : 'gray'}"></span>`
  }

  function escHtml (s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  function abbreviateSeries (s) {
    if (!s) return '—'
    if (s.includes('Marketing')) return 'Marketing'
    if (s.includes('Sales')) return 'Sales'
    if (s.includes('Customer')) return 'Cx Gaps'
    return s.slice(0, 14)
  }

  // ── Actions ──────────────────────────────────────────────────
  window.markReady = async function (id) {
    await window.sb.from('scripts').update({ status: 'Ready' }).eq('id', id)
    window.closeScriptModal()
    await loadScripts()
  }

  window.markUsed = async function (id) {
    await window.sb.from('scripts').update({ status: 'Used', used_at: new Date().toISOString() }).eq('id', id)
    window.closeScriptModal()
    await loadScripts()
  }

  window.queueConsistencyCheck = async function (id) {
    const btn = document.getElementById(`run-check-${id}`)
    const status = document.getElementById(`check-status-${id}`)
    if (btn) btn.disabled = true
    try {
      await window.sb.from('requests').insert({
        type: 'consistency-check', status: 'pending',
        payload: { script_id: id }, created_at: new Date().toISOString()
      })
      if (status) status.textContent = 'Check queued'
      if (btn) btn.textContent = 'Queued ✓'
    } catch {
      if (btn) btn.disabled = false
      if (status) status.textContent = 'Failed to queue'
    }
  }

  window.checkAllDrafts = async function () {
    const btn = document.getElementById('batch-check-btn')
    const statusEl = document.getElementById('batch-check-status')
    if (btn) btn.disabled = true
    try {
      await window.sb.from('requests').insert({
        type: 'consistency-check-batch', status: 'pending',
        created_at: new Date().toISOString()
      })
      if (statusEl) statusEl.textContent = 'Batch check queued'
      if (btn) btn.textContent = 'Queued ✓'
    } catch {
      if (btn) btn.disabled = false
      if (statusEl) statusEl.textContent = 'Failed to queue'
    }
  }

  // ── Filters + search ─────────────────────────────────────────
  document.querySelectorAll('[data-scripts-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.scriptsFilter
      document.querySelectorAll('[data-scripts-filter]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentPage = 1
      renderTable()
    })
  })

  const searchEl = document.getElementById('scripts-search')
  if (searchEl) {
    searchEl.addEventListener('input', e => {
      searchQuery = e.target.value.trim()
      currentPage = 1
      renderTable()
    })
  }

  loadScripts()
  window.scriptsRefresh = loadScripts
})()
