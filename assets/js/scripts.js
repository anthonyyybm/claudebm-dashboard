// Scripts tab — pagination, modal, edit, delete, multi-select, bulk actions
;(function () {
  let allScripts = []
  let activeFilter = 'All'
  let searchQuery = ''
  let currentPage = 1
  let pageSize = 10
  let selectedIds = new Set()

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

  // ── Inject bulk action bar ──────────────────────────────────
  const filterBarEl = document.querySelector('#tab-scripts .filter-bar')
  if (filterBarEl) {
    filterBarEl.insertAdjacentHTML('afterend', `
<div id="scripts-bulk-bar" class="bulk-bar">
  <span class="bulk-count" id="bulk-count-text">0 scripts selected</span>
  <button class="btn" onclick="window.bulkMarkReady()">Mark Ready</button>
  <button class="btn btn-ghost" onclick="window.bulkMarkUsed()">Mark Used</button>
  <button class="btn" onclick="window.bulkRegenerate()">Regenerate Prompts</button>
  <button class="btn btn-danger" onclick="window.bulkDelete()">Delete Selected</button>
  <button class="btn btn-ghost" onclick="window.clearSelection()" style="padding:4px 9px;font-size:13px;line-height:1;margin-left:auto">&#x2715;</button>
</div>`)
  }

  // ── Toast ────────────────────────────────────────────────────
  let _toastWrap = null
  function showToast (msg, type) {
    if (!_toastWrap) {
      _toastWrap = document.createElement('div')
      _toastWrap.className = 'toast-container'
      document.body.appendChild(_toastWrap)
    }
    const t = document.createElement('div')
    t.className = 'toast ' + (type || 'info')
    t.textContent = msg
    _toastWrap.appendChild(t)
    setTimeout(() => {
      t.style.transition = 'opacity .3s ease'
      t.style.opacity = '0'
      setTimeout(() => t.remove(), 320)
    }, 3000)
  }

  // ── Confirm dialog ───────────────────────────────────────────
  function showConfirm (msg, onConfirm, confirmLabel) {
    confirmLabel = confirmLabel || 'Confirm'
    const ov = document.createElement('div')
    ov.className = 'confirm-overlay'
    ov.innerHTML = `
      <div class="confirm-card" onclick="event.stopPropagation()">
        <div class="confirm-message">${escHtml(msg)}</div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" id="_conf-cancel">Cancel</button>
          <button class="btn btn-danger" id="_conf-ok">${escHtml(confirmLabel)}</button>
        </div>
      </div>`
    document.body.appendChild(ov)
    ov.querySelector('#_conf-cancel').addEventListener('click', () => ov.remove())
    ov.querySelector('#_conf-ok').addEventListener('click', () => { ov.remove(); onConfirm() })
    ov.addEventListener('click', () => ov.remove())
  }

  // ── Load ─────────────────────────────────────────────────────
  async function loadScripts () {
    const table = document.getElementById('scripts-table-body')
    if (!table) return
    table.innerHTML = '<tr><td colspan="14"><div class="skeleton"></div></td></tr>'
    try {
      const { data, error } = await window.sb
        .from('scripts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      allScripts = data || []
      currentPage = 1
      selectedIds.clear()
      updateBulkBar()
      renderTable()
    } catch {
      table.innerHTML = '<tr><td colspan="14" class="error-state">Failed to load scripts.</td></tr>'
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

    // Select-all checkbox state
    const allCheck = document.getElementById('select-all-check')
    if (allCheck) {
      const pageIds = page.map(s => s.id)
      const allSel = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id))
      const someSel = pageIds.some(id => selectedIds.has(id))
      allCheck.checked = allSel
      allCheck.indeterminate = !allSel && someSel
    }

    if (page.length === 0) {
      table.innerHTML = '<tr><td colspan="14" class="text-muted text-sm" style="padding:16px">No scripts match this filter.</td></tr>'
      renderPagination(0, 0)
      return
    }

    table.innerHTML = page.map(s => `
      <tr class="script-table-row" data-id="${s.id}" style="cursor:pointer" onclick="window.openScriptModal('${s.id}')">
        <td onclick="event.stopPropagation()" style="padding:8px 4px 8px 10px;width:30px">
          <input type="checkbox" class="row-check" data-id="${s.id}"
            ${selectedIds.has(s.id) ? 'checked' : ''}
            onclick="event.stopPropagation(); window.toggleSelect('${s.id}')">
        </td>
        <td class="script-topic" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.topic || '—')}</td>
        <td class="text-xs text-muted">${abbreviateSeries(s.series)}</td>
        <td class="text-xs text-muted">${escHtml(s.content_type || '—')}</td>
        <td><span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span></td>
        <td>${ccBadge(s.consistency_check)}</td>
        <td>${dot(s.image_prompt)}</td>
        <td>${dot(s.video_prompt_p1)}</td>
        <td>${dot(s.video_prompt_p2)}</td>
        <td>${dot(s.video_prompt_p3)}</td>
        <td>${dot(s.video_prompt_p4)}</td>
        <td>${dot(s.cta_prompt)}</td>
        <td>${dot(s.caption_tiktok)}</td>
        <td class="text-xs text-muted">${s.created_at ? s.created_at.slice(0, 10) : '—'}</td>
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
          ${[10, 25, 50].map(n => `<button class="page-btn${pageSize === n ? ' active' : ''}" onclick="window.scriptsSetPageSize(${n})">${n}</button>`).join('')}
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

  // ── Selection ─────────────────────────────────────────────────
  window.toggleSelect = function (id) {
    if (selectedIds.has(id)) selectedIds.delete(id)
    else selectedIds.add(id)
    updateBulkBar()
    // Sync select-all state without full re-render
    const allCheck = document.getElementById('select-all-check')
    if (allCheck) {
      const filtered = getFiltered()
      const page = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      const pageIds = page.map(s => s.id)
      const allSel = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id))
      const someSel = pageIds.some(id => selectedIds.has(id))
      allCheck.checked = allSel
      allCheck.indeterminate = !allSel && someSel
    }
  }

  window.toggleSelectAll = function () {
    const filtered = getFiltered()
    const page = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const allCheck = document.getElementById('select-all-check')
    const shouldSelect = allCheck ? allCheck.checked : true
    page.forEach(s => { if (shouldSelect) selectedIds.add(s.id); else selectedIds.delete(s.id) })
    renderTable()
    updateBulkBar()
  }

  window.clearSelection = function () {
    selectedIds.clear()
    updateBulkBar()
    renderTable()
  }

  function updateBulkBar () {
    const bar = document.getElementById('scripts-bulk-bar')
    const txt = document.getElementById('bulk-count-text')
    if (!bar) return
    const n = selectedIds.size
    if (n > 0) {
      bar.classList.add('visible')
      if (txt) txt.textContent = `${n} script${n === 1 ? '' : 's'} selected`
    } else {
      bar.classList.remove('visible')
    }
  }

  // ── Modal ─────────────────────────────────────────────────────
  window.openScriptModal = function (id) {
    const s = allScripts.find(x => x.id === id)
    if (!s) return
    window._currentModalId = id

    const overlay  = document.getElementById('script-modal-overlay')
    const titleEl  = document.getElementById('modal-title')
    const badgesEl = document.getElementById('modal-badges')
    const bodyEl   = document.getElementById('modal-body')
    const footerEl = document.getElementById('modal-footer')

    titleEl.textContent = s.topic || '—'
    badgesEl.innerHTML = `
      <span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span>
      <span class="badge gray">${abbreviateSeries(s.series)}</span>
      <span class="badge accent">${escHtml(s.content_type || 'No format')}</span>
      ${ccBadge(s.consistency_check)}`

    bodyEl.innerHTML = [
      modalField('Full Script', [s.hook, s.script_part1, s.script_part2, s.script_part3, s.script_part4].filter(Boolean).join('\n\n')),
      modalField('Image Prompt',        s.image_prompt,       'image_prompt'),
      modalField('Video Prompt P1',     s.video_prompt_p1,    'video_prompt_p1'),
      modalField('Video Prompt P2',     s.video_prompt_p2,    'video_prompt_p2'),
      s.video_prompt_p3 ? modalField('Video Prompt P3', s.video_prompt_p3, 'video_prompt_p3') : '',
      s.video_prompt_p4 ? modalField('Video Prompt P4', s.video_prompt_p4, 'video_prompt_p4') : '',
      s.cta_prompt ? modalField('CTA Prompt', s.cta_prompt,   'cta_prompt') : '',
      modalField('Caption — TikTok',    s.caption_tiktok,     'caption_tiktok'),
      modalField('Caption — Instagram', s.caption_instagram,  'caption_instagram'),
      consistencySection(s)
    ].join('')

    footerEl.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${s.status !== 'Ready' ? `<button class="btn" onclick="window.markReady('${s.id}')">Mark Ready</button>` : ''}
        ${s.status !== 'Used'  ? `<button class="btn btn-ghost" onclick="window.markUsed('${s.id}')">Mark Used</button>` : ''}
        <button class="btn btn-ghost" style="font-size:11px" onclick="window.regenerateSingle('${s.id}')">&#x21bb; Regenerate Prompts</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="text-xs text-muted">${s.created_at ? s.created_at.slice(0, 10) : ''}</div>
        <button class="btn btn-danger" onclick="window.deleteScript('${s.id}')">Delete</button>
      </div>`

    overlay.style.display = 'flex'
    document.body.style.overflow = 'hidden'
  }

  window.closeScriptModal = function () {
    const overlay = document.getElementById('script-modal-overlay')
    if (overlay) overlay.style.display = 'none'
    document.body.style.overflow = ''
    window._currentModalId = null
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeScriptModal() })

  // ── Modal field ───────────────────────────────────────────────
  function modalField (label, val, fieldKey) {
    if (!val) return ''
    const uid    = 'mf' + Math.random().toString(36).slice(2, 9)
    const editId = 'eb' + uid
    return `<div class="modal-section">
      <div class="modal-section-header">
        <div class="detail-label">${label}</div>
        <div style="display:flex;gap:4px">
          <button class="copy-btn" onclick="window.copyField('${uid}',this)">Copy</button>
          ${fieldKey ? `<button class="copy-btn" id="${editId}" onclick="window.editField('${uid}','${fieldKey}','${editId}')">Edit</button>` : ''}
        </div>
      </div>
      <div class="detail-text" id="${uid}" data-original="${escAttr(val)}">${escHtml(val)}</div>
    </div>`
  }

  // ── Field editing ─────────────────────────────────────────────
  window.editField = function (uid, fieldKey, editId) {
    const el = document.getElementById(uid)
    const editBtn = document.getElementById(editId)
    if (!el || el.dataset.editing) return
    el.dataset.editing = '1'
    const orig = el.dataset.original !== undefined ? el.dataset.original : el.textContent
    el.style.display = 'none'
    if (editBtn) editBtn.style.display = 'none'

    const section = el.parentElement
    const ta = document.createElement('textarea')
    ta.className = 'field-textarea'
    ta.value = orig
    ta.id = uid + '-ta'
    section.appendChild(ta)

    const acts = document.createElement('div')
    acts.className = 'edit-actions'
    acts.id = uid + '-acts'
    acts.innerHTML = `
      <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px"
        onclick="window.cancelEdit('${uid}','${editId}')">Cancel</button>
      <button class="btn" style="font-size:11px;padding:3px 10px"
        onclick="window.saveField('${uid}','${fieldKey}','${editId}')">Save</button>`
    section.appendChild(acts)
    ta.focus()
    ta.selectionStart = ta.selectionEnd = ta.value.length
  }

  window.cancelEdit = function (uid, editId) {
    const el     = document.getElementById(uid)
    const ta     = document.getElementById(uid + '-ta')
    const acts   = document.getElementById(uid + '-acts')
    const editBtn= document.getElementById(editId)
    if (ta)    ta.remove()
    if (acts)  acts.remove()
    if (el)    { el.style.display = ''; delete el.dataset.editing }
    if (editBtn) editBtn.style.display = ''
  }

  window.saveField = async function (uid, fieldKey, editId) {
    const ta   = document.getElementById(uid + '-ta')
    const el   = document.getElementById(uid)
    const acts = document.getElementById(uid + '-acts')
    if (!ta || !el) return

    const saveBtn = acts ? acts.querySelector('.btn:last-child') : null
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…' }

    const newVal   = ta.value.trim()
    const scriptId = window._currentModalId
    try {
      const { error } = await window.sb.from('scripts').update({ [fieldKey]: newVal }).eq('id', scriptId)
      if (error) throw error
      const s = allScripts.find(x => x.id === scriptId)
      if (s) s[fieldKey] = newVal
      el.textContent = newVal
      el.dataset.original = newVal
      window.cancelEdit(uid, editId)
      showToast('Saved', 'success')
    } catch (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save' }
      showToast('Save failed: ' + (err.message || 'unknown error'), 'error')
    }
  }

  // ── Copy ──────────────────────────────────────────────────────
  window.copyField = function (id, btn) {
    const el = document.getElementById(id)
    if (!el) return
    navigator.clipboard.writeText(el.textContent).then(() => {
      btn.textContent = 'Copied!'
      btn.classList.add('copied')
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied') }, 2000)
    }).catch(() => {})
  }

  // ── Delete script ─────────────────────────────────────────────
  window.deleteScript = function (id) {
    const s = allScripts.find(x => x.id === id)
    const topic = s ? `"${s.topic}"` : 'this script'
    showConfirm(
      `Are you sure you want to delete ${topic}? This cannot be undone.`,
      async () => {
        try {
          const { error } = await window.sb.from('scripts').delete().eq('id', id)
          if (error) throw error
          allScripts = allScripts.filter(x => x.id !== id)
          selectedIds.delete(id)
          updateBulkBar()
          window.closeScriptModal()
          renderTable()
          showToast('Script deleted', 'success')
        } catch (err) {
          showToast('Delete failed: ' + (err.message || 'unknown error'), 'error')
        }
      },
      'Delete'
    )
  }

  // ── Regenerate (single) ───────────────────────────────────────
  window.regenerateSingle = async function (id) {
    try {
      await window.sb.from('requests').insert({
        type: 'regenerate-prompts', status: 'pending',
        payload: { script_ids: [id] },
        created_at: new Date().toISOString()
      })
      showToast('Regeneration queued — Claude Code will process this shortly', 'info')
    } catch (err) {
      showToast('Failed to queue: ' + (err.message || 'unknown error'), 'error')
    }
  }

  // ── Bulk actions ──────────────────────────────────────────────
  window.bulkDelete = function () {
    const n = selectedIds.size
    if (!n) return
    showConfirm(
      `Delete ${n} script${n === 1 ? '' : 's'}? This cannot be undone.`,
      async () => {
        try {
          const ids = [...selectedIds]
          const { error } = await window.sb.from('scripts').delete().in('id', ids)
          if (error) throw error
          allScripts = allScripts.filter(s => !ids.includes(s.id))
          selectedIds.clear()
          updateBulkBar()
          renderTable()
          showToast(`${n} script${n === 1 ? '' : 's'} deleted`, 'success')
        } catch (err) {
          showToast('Bulk delete failed: ' + (err.message || 'unknown error'), 'error')
        }
      },
      `Delete ${n}`
    )
  }

  window.bulkRegenerate = async function () {
    const ids = [...selectedIds]
    if (!ids.length) return
    try {
      await window.sb.from('requests').insert({
        type: 'regenerate-prompts', status: 'pending',
        payload: { script_ids: ids },
        created_at: new Date().toISOString()
      })
      showToast(`Regeneration queued for ${ids.length} script${ids.length === 1 ? '' : 's'} — Claude Code will process this shortly`, 'info')
    } catch (err) {
      showToast('Failed to queue: ' + (err.message || 'unknown error'), 'error')
    }
  }

  window.bulkMarkReady = async function () {
    const ids = [...selectedIds]
    if (!ids.length) return
    try {
      const { error } = await window.sb.from('scripts').update({ status: 'Ready' }).in('id', ids)
      if (error) throw error
      ids.forEach(id => { const s = allScripts.find(x => x.id === id); if (s) s.status = 'Ready' })
      renderTable()
      showToast(`${ids.length} script${ids.length === 1 ? '' : 's'} marked Ready`, 'success')
    } catch (err) {
      showToast('Failed: ' + (err.message || 'unknown error'), 'error')
    }
  }

  window.bulkMarkUsed = async function () {
    const ids = [...selectedIds]
    if (!ids.length) return
    try {
      const now = new Date().toISOString()
      const { error } = await window.sb.from('scripts').update({ status: 'Used', used_at: now }).in('id', ids)
      if (error) throw error
      ids.forEach(id => { const s = allScripts.find(x => x.id === id); if (s) { s.status = 'Used'; s.used_at = now } })
      selectedIds.clear()
      updateBulkBar()
      renderTable()
      showToast(`${ids.length} script${ids.length === 1 ? '' : 's'} marked Used`, 'success')
    } catch (err) {
      showToast('Failed: ' + (err.message || 'unknown error'), 'error')
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
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
      const arr = Array.isArray(flags) ? flags : flags && typeof flags === 'object' ? Object.values(flags) : flags ? [String(flags)] : []
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

  function dot (val) { return `<span class="dot ${val ? 'accent' : 'gray'}"></span>` }

  function escHtml (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function escAttr (s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function abbreviateSeries (s) {
    if (!s) return '—'
    if (s.includes('Marketing')) return 'Marketing'
    if (s.includes('Sales'))     return 'Sales'
    if (s.includes('Customer'))  return 'Cx Gaps'
    return s.slice(0, 14)
  }

  // ── Status actions ────────────────────────────────────────────
  window.markReady = async function (id) {
    const { error } = await window.sb.from('scripts').update({ status: 'Ready' }).eq('id', id)
    if (!error) { const s = allScripts.find(x => x.id === id); if (s) s.status = 'Ready' }
    window.closeScriptModal()
    renderTable()
    showToast('Marked as Ready', 'success')
  }

  window.markUsed = async function (id) {
    const now = new Date().toISOString()
    const { error } = await window.sb.from('scripts').update({ status: 'Used', used_at: now }).eq('id', id)
    if (!error) { const s = allScripts.find(x => x.id === id); if (s) { s.status = 'Used'; s.used_at = now } }
    window.closeScriptModal()
    renderTable()
    showToast('Marked as Used', 'success')
  }

  window.queueConsistencyCheck = async function (id) {
    const btn    = document.getElementById(`run-check-${id}`)
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
    const btn      = document.getElementById('batch-check-btn')
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

  // ── Filters + search ──────────────────────────────────────────
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
