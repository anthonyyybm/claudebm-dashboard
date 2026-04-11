// Scripts tab — pagination, modal, edit, delete, multi-select, bulk actions
;(function () {
  let allScripts = []
  let activeFilter = 'All'
  let searchQuery = ''
  let currentPage = 1
  let pageSize = 10
  let sortOrder = 'newest'
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
        <div id="modal-script-id" style="font-family:ui-monospace,monospace;font-size:10px;color:var(--text3);margin-top:4px"></div>
      </div>
      <button class="copy-btn" id="modal-copy-all-btn" onclick="window.copyAllScript()" style="font-size:11px;padding:3px 10px;align-self:flex-start;flex-shrink:0">Copy All</button>
      <button class="modal-close" onclick="window.closeScriptModal()">&#x2715;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-footer" id="modal-footer" style="flex-direction:column;align-items:stretch;gap:0;padding:12px 18px"></div>
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
    rows = [...rows]
    switch (sortOrder) {
      case 'oldest':
        rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        break
      case 'series':
        rows.sort((a, b) => (a.series || '').localeCompare(b.series || ''))
        break
      case 'content_type':
        rows.sort((a, b) => (a.content_type || '').localeCompare(b.content_type || ''))
        break
      case 'status': {
        const ord = { Draft: 0, Ready: 1, Used: 2 }
        rows.sort((a, b) => (ord[a.status] ?? 3) - (ord[b.status] ?? 3))
        break
      }
      case 'relevance':
        rows.sort((a, b) => (a.consistency_check === 'Passed' ? 0 : 1) - (b.consistency_check === 'Passed' ? 0 : 1))
        break
      default:
        rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
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
        <td>${formatBadge(s.content_type)}</td>
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
    const scriptIdEl = document.getElementById('modal-script-id')
    if (scriptIdEl) scriptIdEl.textContent = `ID: ${String(s.id).slice(0, 8)}…`
    badgesEl.innerHTML = `
      <span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span>
      <span class="badge gray">${abbreviateSeries(s.series)}</span>
      ${formatBadge(s.content_type)}
      ${ccBadge(s.consistency_check)}`

    bodyEl.innerHTML = [
      modalField('Script', [s.hook, s.script_part1, s.script_part2].filter(Boolean).join('\n\n'), null, 'detail-text-mono'),
      renderImagePromptsField(s, id),
      renderVideoPromptsField(s),
      s.cta_prompt ? modalField('CTA Prompt', s.cta_prompt,   'cta_prompt') : '',
      s.platform_notes ? renderPlatformNotesField(s.platform_notes) : '',
      s.content_type === 'Granny Reacts' ? renderGrannyReactsSection(s) : '',
      modalField('Caption — TikTok',    s.caption_tiktok,     'caption_tiktok'),
      modalField('Caption — Instagram', s.caption_instagram,  'caption_instagram'),
      consistencySection(s)
    ].join('')

    footerEl.innerHTML = `
      <div class="modal-footer-inner">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${s.status !== 'Ready' ? `<button class="btn" onclick="window.markReady('${s.id}')">Mark Ready</button>` : ''}
          ${s.status !== 'Used'  ? `<button class="btn btn-ghost" onclick="window.markUsed('${s.id}')">Mark Used</button>` : ''}
          <button class="btn btn-ghost" style="font-size:11px" onclick="window.regenerateSingle('${s.id}')">&#x21bb; Regenerate Prompts</button>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="text-xs text-muted">${s.created_at ? s.created_at.slice(0, 10) : ''}</div>
          <button class="btn btn-danger" onclick="window.deleteScript('${s.id}')">Delete</button>
        </div>
      </div>
      <div id="script-feedback-section" class="feedback-section">
        <div class="feedback-label">Feedback</div>
        <div class="feedback-inner"><span class="text-xs text-muted">Loading…</span></div>
      </div>`

    overlay.style.display = 'flex'
    document.body.style.overflow = 'hidden'
    loadScriptFeedback(s.id)
  }

  window.closeScriptModal = function () {
    const overlay = document.getElementById('script-modal-overlay')
    if (overlay) overlay.style.display = 'none'
    document.body.style.overflow = ''
    window._currentModalId = null
  }

  window.copyAllScript = function () {
    const id = window._currentModalId
    const s  = allScripts.find(x => x.id === id)
    if (!s) return

    const sep   = '\n' + '─'.repeat(60) + '\n'
    const parts = []

    // Topic
    if (s.topic) parts.push(`TOPIC: ${s.topic}`)

    // Script
    const scriptText = [s.hook, s.script_part1, s.script_part2].filter(Boolean).join('\n\n')
    if (scriptText) parts.push(`SCRIPT:\n${scriptText}`)

    // Image prompts
    if (s.image_prompts && s.image_prompts.trim()) {
      const imgs = s.image_prompts.split(/\n---IMAGE BREAK---\n/)
      if (imgs.length === 1) {
        parts.push(`IMAGE PROMPT:\n${s.image_prompts.trim()}`)
      } else {
        imgs.forEach((p, i) => {
          if (p.trim()) parts.push(`IMAGE ${i + 1}:\n${p.trim()}`)
        })
      }
    } else if (s.image_prompt && s.image_prompt.trim()) {
      parts.push(`IMAGE PROMPT:\n${s.image_prompt.trim()}`)
    }

    // Video prompts
    if (s.video_prompts && s.video_prompts.trim()) {
      const vids   = s.video_prompts.split(/\n---VIDEO BREAK---\n/)
      const labels = ['VIDEO PROMPT P1', 'VIDEO PROMPT P2', 'VIDEO PROMPT P3', 'VIDEO PROMPT P4']
      vids.forEach((p, i) => {
        if (p.trim()) parts.push(`${labels[i] || `VIDEO PROMPT P${i + 1}`}:\n${p.trim()}`)
      })
    } else {
      if (s.video_prompt_p1) parts.push(`VIDEO PROMPT P1:\n${s.video_prompt_p1}`)
      if (s.video_prompt_p2) parts.push(`VIDEO PROMPT P2:\n${s.video_prompt_p2}`)
      if (s.video_prompt_p3) parts.push(`VIDEO PROMPT P3:\n${s.video_prompt_p3}`)
      if (s.video_prompt_p4) parts.push(`VIDEO PROMPT P4:\n${s.video_prompt_p4}`)
    }

    // CTA
    if (s.cta_prompt) parts.push(`CTA PROMPT:\n${s.cta_prompt}`)

    // Platform notes
    if (s.platform_notes) parts.push(`PLATFORM NOTES:\n${s.platform_notes}`)

    // Captions
    if (s.caption_tiktok)    parts.push(`CAPTION — TIKTOK:\n${s.caption_tiktok}`)
    if (s.caption_instagram) parts.push(`CAPTION — INSTAGRAM:\n${s.caption_instagram}`)

    const text = parts.join(sep)
    const btn  = document.getElementById('modal-copy-all-btn')
    navigator.clipboard.writeText(text).then(() => {
      if (btn) { btn.textContent = 'Copied!'; btn.classList.add('copied') }
      setTimeout(() => {
        if (btn) { btn.textContent = 'Copy All'; btn.classList.remove('copied') }
      }, 2000)
    }).catch(() => {})
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeScriptModal() })

  // ── Image prompt — split START/END FRAME into separate cards ─
  function renderImagePromptField (val, scriptId) {
    if (!val) return ''
    const endIdx = val.search(/\[END FRAME/i)
    if (endIdx === -1) return modalField('Image Prompt', val, 'image_prompt')

    const startContent = val.substring(0, endIdx).trim()
    const endContent   = val.substring(endIdx).trim()
    const uid1 = 'mf' + Math.random().toString(36).slice(2, 9)
    const uid2 = 'mf' + Math.random().toString(36).slice(2, 9)

    return `<div class="modal-section">
      <div class="modal-section-header">
        <div class="detail-label">Image Prompt — Start Frame</div>
        <div style="display:flex;gap:4px">
          <button class="copy-btn" onclick="window.copyField('${uid1}',this)">Copy</button>
        </div>
      </div>
      <div class="detail-text" id="${uid1}">${escHtml(startContent)}</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-header">
        <div class="detail-label">Image Prompt — End Frame</div>
        <div style="display:flex;gap:4px">
          <button class="copy-btn" onclick="window.copyField('${uid2}',this)">Copy</button>
          <button class="copy-btn" onclick="window.editFullImagePrompt('${scriptId}')">Edit Full</button>
        </div>
      </div>
      <div class="detail-text" id="${uid2}">${escHtml(endContent)}</div>
    </div>`
  }

  // ── Image prompts — consolidated (image_prompts) with fallback ─
  function renderImagePromptsField (s, scriptId) {
    // Use consolidated image_prompts if available
    if (s.image_prompts && s.image_prompts.trim()) {
      const parts = s.image_prompts.split(/\n---IMAGE BREAK---\n/)
      if (parts.length <= 1) {
        // Single image — use existing split-frame logic
        return renderImagePromptField(s.image_prompts, scriptId)
      }
      // Multiple images — show each with its own copy button
      return parts.map((part, i) => {
        const uid = 'mf' + Math.random().toString(36).slice(2, 9)
        return `<div class="modal-section">
          <div class="modal-section-header">
            <div class="detail-label">Image ${i + 1}</div>
            <div style="display:flex;gap:4px">
              <button class="copy-btn" onclick="window.copyField('${uid}',this)">Copy</button>
            </div>
          </div>
          <div class="detail-text" id="${uid}">${escHtml(part.trim())}</div>
        </div>`
      }).join('')
    }
    // Fallback to legacy image_prompt
    return renderImagePromptField(s.image_prompt, scriptId)
  }

  // ── Video prompts — consolidated (video_prompts) with fallback ─
  function renderVideoPromptsField (s) {
    // Use consolidated video_prompts if available
    if (s.video_prompts && s.video_prompts.trim()) {
      const parts = s.video_prompts.split(/\n---VIDEO BREAK---\n/)
      const labels = ['Video P1', 'Video P2', 'Video P3', 'Video P4']
      return parts.map((part, i) => {
        const label = labels[i] || `Video P${i + 1}`
        const fieldKey = ['video_prompt_p1', 'video_prompt_p2', 'video_prompt_p3', 'video_prompt_p4'][i] || null
        return modalField(label, part.trim(), fieldKey)
      }).join('')
    }
    // Fallback to legacy columns
    return [
      modalField('Video Prompt P1', s.video_prompt_p1, 'video_prompt_p1'),
      modalField('Video Prompt P2', s.video_prompt_p2, 'video_prompt_p2'),
      s.video_prompt_p3 ? modalField('Video Prompt P3', s.video_prompt_p3, 'video_prompt_p3') : '',
      s.video_prompt_p4 ? modalField('Video Prompt P4', s.video_prompt_p4, 'video_prompt_p4') : ''
    ].join('')
  }

  // ── Platform notes — up to 3 platforms, new or legacy format ──
  function renderPlatformNotesField (val) {
    if (!val) return ''
    const uid = 'mf' + Math.random().toString(36).slice(2, 9)
    let platforms = []

    if (val.includes('---PLATFORM BREAK---')) {
      // New format: sections separated by ---PLATFORM BREAK---
      const sections = val.split(/\n?---PLATFORM BREAK---\n?/)
      const labels = ['TikTok', 'Instagram', 'YouTube Shorts']
      platforms = sections.map((s, i) => ({ label: labels[i] || `Platform ${i + 1}`, content: s.trim() })).filter(p => p.content)
    } else {
      // Legacy format: TikTok: ... Instagram: ... labels
      const tiktokMatch = val.match(/TikTok:\s*([\s\S]*?)(?=\n\nInstagram:|$)/i)
      const instagramMatch = val.match(/Instagram:\s*([\s\S]*?)$/i)
      if (tiktokMatch) platforms.push({ label: 'TikTok', content: tiktokMatch[1].trim() })
      if (instagramMatch) platforms.push({ label: 'Instagram', content: instagramMatch[1].trim() })
      if (!platforms.length) platforms.push({ label: 'Platform Notes', content: val.trim() })
    }

    return `<div class="modal-section">
      <div class="modal-section-header">
        <div class="detail-label">Platform Notes</div>
        <button class="copy-btn" onclick="window.copyField('${uid}',this)">Copy All</button>
      </div>
      <div id="${uid}" style="display:none">${escHtml(val)}</div>
      ${platforms.map((p, i) => `<div style="${i < platforms.length - 1 ? 'margin-bottom:8px' : ''}">
        <span style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${escHtml(p.label)}</span>
        <div class="detail-text" style="margin-top:4px;font-size:11px">${escHtml(p.content)}</div>
      </div>`).join('')}
    </div>`
  }

  // ── Granny Reacts — text card + source reference + CapCut guide ─
  function renderGrannyReactsSection (s) {
    const parts = []

    // Text card — extract [TEXT CARD] section from video_prompts
    let textCard = null
    if (s.video_prompts) {
      const tcMatch = s.video_prompts.match(/\[TEXT CARD\]([\s\S]*?)(?=\n---VIDEO BREAK---|$)/)
      if (tcMatch) textCard = tcMatch[1].trim()
    }
    if (!textCard && s.hook) textCard = s.hook

    if (textCard) {
      const uid = 'mf' + Math.random().toString(36).slice(2, 9)
      parts.push(`<div class="modal-section">
        <div class="modal-section-header">
          <div class="detail-label">Text Card 3s</div>
          <button class="copy-btn" onclick="window.copyField('${uid}',this)">Copy</button>
        </div>
        <div class="detail-text detail-text-mono" id="${uid}">${escHtml(textCard)}</div>
      </div>`)
    }

    // Source reference with clickable link
    if (s.reaction_reference) {
      const uid = 'mf' + Math.random().toString(36).slice(2, 9)
      const urlMatch = s.reaction_reference.match(/https?:\/\/[^\s)]+/)
      const displayVal = urlMatch
        ? s.reaction_reference.replace(urlMatch[0], `<a href="${escAttr(urlMatch[0])}" target="_blank" rel="noopener" style="color:var(--accent)">${escHtml(urlMatch[0])}</a>`)
        : escHtml(s.reaction_reference)
      parts.push(`<div class="modal-section">
        <div class="modal-section-header">
          <div class="detail-label">Source Reference</div>
          <button class="copy-btn" onclick="window.copyField('${uid}',this)">Copy</button>
        </div>
        <div id="${uid}" style="display:none">${escHtml(s.reaction_reference)}</div>
        <div class="detail-text" style="font-size:12px">${displayVal}</div>
      </div>`)
    }

    // CapCut edit guide — parse from video_prompts (multi-line)
    let capcut = null
    if (s.video_prompts) {
      const ccIdx = s.video_prompts.indexOf('CapCut assembly:')
      if (ccIdx !== -1) {
        capcut = s.video_prompts.slice(ccIdx).trim()
        // Stop at next double-newline that begins a bracketed label
        const stop = capcut.search(/\n\n\[/)
        if (stop !== -1) capcut = capcut.slice(0, stop).trim()
      }
    }
    if (capcut) {
      const uid = 'mf' + Math.random().toString(36).slice(2, 9)
      parts.push(`<div class="modal-section">
        <div class="modal-section-header">
          <div class="detail-label">CapCut Edit Guide</div>
          <button class="copy-btn" onclick="window.copyField('${uid}',this)">Copy</button>
        </div>
        <div class="detail-text detail-text-mono" id="${uid}" style="font-size:11px;line-height:1.7">${escHtml(capcut)}</div>
      </div>`)
    }

    return parts.join('')
  }

  // ── Edit full image_prompt (for dual-frame scripts) ───────────
  window.editFullImagePrompt = function (scriptId) {
    const s = allScripts.find(x => x.id === scriptId)
    if (!s) return
    const bodyEl = document.getElementById('modal-body')
    if (!bodyEl) return

    bodyEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
      <div class="detail-label">Edit Full Image Prompt</div>
      <textarea id="full-img-ta" class="field-textarea" style="min-height:420px">${escHtml(s.image_prompt || '')}</textarea>
      <div class="edit-actions">
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px" id="full-img-cancel">Cancel</button>
        <button class="btn" style="font-size:11px;padding:3px 10px" id="full-img-save">Save</button>
      </div>
    </div>`

    document.getElementById('full-img-cancel').addEventListener('click', () => window.openScriptModal(scriptId))
    document.getElementById('full-img-save').addEventListener('click', async () => {
      const saveBtn = document.getElementById('full-img-save')
      const ta = document.getElementById('full-img-ta')
      if (!ta || !saveBtn) return
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…'
      const newVal = ta.value.trim()
      try {
        const { error } = await window.sb.from('scripts').update({ image_prompt: newVal }).eq('id', scriptId)
        if (error) throw error
        s.image_prompt = newVal
        showToast('Saved', 'success')
        window.openScriptModal(scriptId)
      } catch (err) {
        saveBtn.disabled = false; saveBtn.textContent = 'Save'
        showToast('Save failed: ' + (err.message || 'unknown error'), 'error')
      }
    })
  }

  // ── Modal field ───────────────────────────────────────────────
  function modalField (label, val, fieldKey, extraClass) {
    if (!val) return ''
    const uid    = 'mf' + Math.random().toString(36).slice(2, 9)
    const editId = 'eb' + uid
    const cls    = extraClass ? `detail-text ${extraClass}` : 'detail-text'
    return `<div class="modal-section">
      <div class="modal-section-header">
        <div class="detail-label">${label}</div>
        <div style="display:flex;gap:4px">
          <button class="copy-btn" onclick="window.copyField('${uid}',this)">Copy</button>
          ${fieldKey ? `<button class="copy-btn" id="${editId}" onclick="window.editField('${uid}','${fieldKey}','${editId}')">Edit</button>` : ''}
        </div>
      </div>
      <div class="${cls}" id="${uid}" data-original="${escAttr(val)}">${escHtml(val)}</div>
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

  function formatBadge (type) {
    if (!type) return '<span class="badge gray">—</span>'
    if (type === 'Granny First')        return `<span class="badge purple">${escHtml(type)}</span>`
    if (type === 'Granny Watches')      return `<span class="badge blue">${escHtml(type)}</span>`
    if (type === 'Creative Commercial') return `<span class="badge coral">${escHtml(type)}</span>`
    if (type === 'Granny Reacts')       return `<span class="badge amber">${escHtml(type)}</span>`
    if (type === 'Walking Scene')       return `<span class="badge green">${escHtml(type)}</span>`
    if (type === 'Natural Interaction') return `<span class="badge teal">${escHtml(type)}</span>`
    if (type === 'Mistake First')       return `<span class="badge blue">${escHtml(type)}</span>`
    return `<span class="badge gray">${escHtml(type)}</span>`
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

  // ── Script Feedback (command-copy approach) ───────────────────
  function loadScriptFeedback (id) {
    const section = document.getElementById('script-feedback-section')
    if (!section) return
    const inner = section.querySelector('.feedback-inner')
    if (!inner) return
    const shortId = String(id).slice(0, 8)
    inner.innerHTML = `
      <div class="feedback-btns">
        <button class="feedback-btn" id="fb-good-${escAttr(id)}" onclick="window.selectRating('${escAttr(id)}','good')">👍 Good</button>
        <button class="feedback-btn" id="fb-bad-${escAttr(id)}"  onclick="window.selectRating('${escAttr(id)}','bad')">👎 Bad</button>
      </div>
      <div id="fb-form-${escAttr(id)}" style="display:none">
        <textarea class="textarea" id="fb-note-${escAttr(id)}" rows="2" placeholder="Add a note (optional)" style="margin-top:8px;font-size:12px"></textarea>
        <button class="btn" style="margin-top:6px;width:100%" onclick="window.generateFeedbackCmd('${escAttr(id)}','${escAttr(shortId)}')">Generate Command</button>
      </div>
      <div id="fb-cmd-${escAttr(id)}"></div>`
  }

  window._feedbackRating = {}

  window.selectRating = function (id, rating) {
    window._feedbackRating[id] = rating
    const goodBtn = document.getElementById(`fb-good-${id}`)
    const badBtn  = document.getElementById(`fb-bad-${id}`)
    const form    = document.getElementById(`fb-form-${id}`)
    if (goodBtn) {
      goodBtn.classList.toggle('selected-good', rating === 'good')
      goodBtn.classList.remove('selected-bad')
    }
    if (badBtn) {
      badBtn.classList.toggle('selected-bad', rating === 'bad')
      badBtn.classList.remove('selected-good')
    }
    if (form) form.style.display = ''
  }

  window.generateFeedbackCmd = function (id, shortId) {
    const rating  = window._feedbackRating[id]
    if (!rating) return
    const noteEl  = document.getElementById(`fb-note-${id}`)
    const cmdBox  = document.getElementById(`fb-cmd-${id}`)
    if (!cmdBox) return
    const note    = noteEl ? noteEl.value.trim() : ''
    const cmd     = note
      ? `/feedback ${rating} ${shortId} "${note}"`
      : `/feedback ${rating} ${shortId}`
    const borderColor = rating === 'good' ? 'var(--success)' : 'var(--danger)'
    const uid = 'fbcmd' + Math.random().toString(36).slice(2, 7)
    cmdBox.innerHTML = `
      <div style="margin-top:10px;border:1.5px solid ${borderColor};border-radius:8px;padding:10px 12px">
        <div class="cmd-code-row" style="margin-bottom:6px">
          <span class="cmd-code" id="${uid}">${escHtml(cmd)}</span>
          <button class="cmd-copy-btn" onclick="window.copyFeedbackCmd('${uid}',this)">Copy</button>
        </div>
        <div class="cmd-desc" style="font-size:11px;color:var(--text3)">Paste this into Claude Code to process feedback</div>
      </div>`
  }

  window.copyFeedbackCmd = function (uid, btn) {
    const el = document.getElementById(uid)
    if (!el) return
    navigator.clipboard.writeText(el.textContent).then(() => {
      btn.textContent = 'Copied!'
      btn.classList.add('copied')
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied') }, 2000)
    }).catch(() => {})
  }

  // ── Generate new batch ────────────────────────────────────────
  window.generateNewBatch = async function () {
    const btn = document.getElementById('generate-batch-btn')
    if (btn) btn.disabled = true
    try {
      await window.sb.from('requests').insert({
        type: 'generate-scripts', status: 'pending',
        payload: { reason: 'manual-request', forced: true },
        created_at: new Date().toISOString()
      })
      showToast('Batch generation queued — Claude Code will process this shortly', 'info')
    } catch (err) {
      showToast('Failed to queue: ' + (err.message || 'unknown error'), 'error')
      if (btn) btn.disabled = false
      return
    }
    setTimeout(() => { if (btn) btn.disabled = false }, 5000)
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

  const sortEl = document.getElementById('scripts-sort')
  if (sortEl) {
    sortEl.addEventListener('change', e => {
      sortOrder = e.target.value
      sortEl.classList.toggle('sort-active', sortOrder !== 'newest')
      currentPage = 1
      renderTable()
    })
  }

  // ── Sub-tab switching ─────────────────────────────────────────
  const subTabBtns  = document.querySelectorAll('[data-sub-tab]')
  const subPanels   = document.querySelectorAll('.sub-tab-panel')

  function activateSubTab (name) {
    subTabBtns.forEach(b => b.classList.toggle('active', b.dataset.subTab === name))
    subPanels.forEach(p  => p.classList.toggle('active',  p.id === `sub-tab-${name}`))
    sessionStorage.setItem('activeSubTab', name)
    switch (name) {
      case 'granny-first':          renderTypePanel('Granny First',        'granny-first');        break
      case 'granny-watches':        renderTypePanel('Granny Watches',      'granny-watches');      break
      case 'walking-scene':         renderTypePanel('Walking Scene',       'walking-scene');       break
      case 'natural-interaction':   renderTypePanel('Natural Interaction', 'natural-interaction'); break
      case 'creative-commercial':   renderCommercialCards();  break
      case 'granny-reacts':         renderGrannyReactsTab(); break
    }
  }

  subTabBtns.forEach(b => b.addEventListener('click', () => activateSubTab(b.dataset.subTab)))

  // ── Type panel (pre-filtered table for a single content type) ─
  function renderTypePanel (type, slug) {
    const container = document.getElementById(`type-panel-${slug}`)
    if (!container) return
    const rows = allScripts
      .filter(s => s.content_type === type)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    if (!rows.length) {
      container.innerHTML = `<div class="gr-empty">No ${type} scripts yet — generate a batch to populate this tab</div>`
      return
    }

    container.innerHTML = `
      <div class="type-panel-header">
        <span class="type-panel-count">${rows.length} script${rows.length === 1 ? '' : 's'}</span>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Topic</th><th>Series</th><th>Status</th><th>Check</th>
                <th title="Image">Img</th>
                <th title="V1">V1</th><th title="V2">V2</th>
                <th title="V3">V3</th><th title="CTA">CTA</th>
                <th title="Captions">Cap</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(s => `
                <tr style="cursor:pointer" onclick="window.openScriptModal('${s.id}')">
                  <td class="script-topic" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.topic || '—')}</td>
                  <td class="text-xs text-muted">${abbreviateSeries(s.series)}</td>
                  <td><span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span></td>
                  <td>${ccBadge(s.consistency_check)}</td>
                  <td>${dot(s.image_prompt || s.image_prompts)}</td>
                  <td>${dot(s.video_prompt_p1)}</td>
                  <td>${dot(s.video_prompt_p2)}</td>
                  <td>${dot(s.video_prompt_p3)}</td>
                  <td>${dot(s.cta_prompt)}</td>
                  <td>${dot(s.caption_tiktok)}</td>
                  <td class="text-xs text-muted">${s.created_at ? s.created_at.slice(0, 10) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`
  }

  // ── Creative Commercial cards ─────────────────────────────────
  function renderCommercialCards () {
    const container = document.getElementById('commercial-cards-container')
    const countEl   = document.getElementById('cc-count')
    if (!container) return
    const rows = allScripts
      .filter(s => s.content_type === 'Creative Commercial')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    if (countEl) countEl.textContent = `${rows.length} script${rows.length === 1 ? '' : 's'}`

    if (!rows.length) {
      container.innerHTML = `<div class="gr-empty">No Creative Commercial scripts yet</div>`
      return
    }

    container.innerHTML = `<div class="cc-cards-grid">
      ${rows.map(s => {
        const hook    = (s.hook || '').slice(0, 80)
        const imgPrev = ((s.image_prompts || s.image_prompt || '').replace(/\[START FRAME[^\]]*\]/gi, '').trim()).slice(0, 60)
        return `<div class="cc-card" onclick="window.openScriptModal('${s.id}')">
          <div class="cc-card-hook">${escHtml(hook)}${(s.hook || '').length > 80 ? '…' : ''}</div>
          <div class="cc-card-meta">
            <span class="badge coral">${escHtml(s.series || 'Commercial')}</span>
            <span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span>
            ${formatBadge(s.content_type)}
            ${ccBadge(s.consistency_check)}
          </div>
          ${imgPrev ? `<div class="cc-card-preview">${escHtml(imgPrev)}…</div>` : ''}
          <div class="text-xs text-muted" style="margin-top:8px">${s.created_at ? s.created_at.slice(0, 10) : '—'}</div>
        </div>`
      }).join('')}
    </div>`
  }

  // ── Granny Reacts tab — 3 sections ───────────────────────────
  function renderGrannyReactsTab () {
    const container = document.getElementById('granny-reacts-container')
    if (!container) return
    const reactScripts = allScripts
      .filter(s => s.content_type === 'Granny Reacts')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    function parseInfluencer (topic) {
      if (!topic) return '—'
      const parts = topic.split(' — ')
      return parts.length > 1 ? parts[0].trim() : topic.slice(0, 20)
    }
    function parseQuote (topic) {
      if (!topic) return '—'
      const idx = topic.indexOf(' — ')
      return idx !== -1 ? topic.slice(idx + 3) : topic
    }

    // Section 1 — Source Videos table
    const sourcesHtml = reactScripts.length
      ? `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Influencer</th><th>Quote preview</th><th>Reference / Link</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${reactScripts.map(s => {
                const ref = s.reaction_reference || ''
                const urlMatch = ref.match(/https?:\/\/[^\s)]+/)
                const linkHtml = urlMatch
                  ? `<a href="${escAttr(urlMatch[0])}" target="_blank" rel="noopener" style="color:var(--accent)" onclick="event.stopPropagation()">${escHtml(ref.length > 50 ? ref.slice(0, 50) + '…' : ref)}</a>`
                  : escHtml(ref.length > 50 ? ref.slice(0, 50) + '…' : ref || '—')
                return `<tr style="cursor:pointer" onclick="window.openScriptModal('${s.id}')">
                  <td class="text-xs" style="white-space:nowrap;font-weight:600">${escHtml(parseInfluencer(s.topic))}</td>
                  <td class="text-xs" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${escHtml(parseQuote(s.topic))}</td>
                  <td class="text-xs" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${linkHtml}</td>
                  <td><span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span></td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>`
      : `<div class="text-muted text-sm" style="padding:16px;text-align:center">No Granny Reacts scripts yet</div>`

    // Section 3 — Generated Scripts as table
    const tableHtml = reactScripts.length
      ? `<div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quote / Topic</th><th>Influencer</th><th>Series</th><th>Status</th><th>Check</th>
                  <th title="Image">Img</th>
                  <th title="V1">V1</th><th title="V2">V2</th><th title="V3">V3</th><th title="CTA">CTA</th>
                  <th title="Captions">Cap</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${reactScripts.map(s => `
                  <tr style="cursor:pointer" onclick="window.openScriptModal('${s.id}')">
                    <td class="script-topic" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(parseQuote(s.topic) || '—')}</td>
                    <td class="text-xs" style="white-space:nowrap">${escHtml(parseInfluencer(s.topic))}</td>
                    <td class="text-xs text-muted">${abbreviateSeries(s.series)}</td>
                    <td><span class="badge ${STATUS_COLOR[s.status] || 'gray'}">${s.status || '—'}</span></td>
                    <td>${ccBadge(s.consistency_check)}</td>
                    <td>${dot(s.image_prompt || s.image_prompts)}</td>
                    <td>${dot(s.video_prompt_p1)}</td>
                    <td>${dot(s.video_prompt_p2)}</td>
                    <td>${dot(s.video_prompt_p3)}</td>
                    <td>${dot(s.cta_prompt)}</td>
                    <td>${dot(s.caption_tiktok)}</td>
                    <td class="text-xs text-muted">${s.created_at ? s.created_at.slice(0, 10) : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`
      : `<div class="gr-empty">No scripts yet — generate one from a transcript above</div>`

    container.innerHTML = `
      <!-- SECTION 1 — Source Videos -->
      <div class="gr-section">
        <div class="gr-section-header">
          <div class="gr-section-title">Source Videos</div>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn" id="gr-find-btn" onclick="window.copyReactionSourcesCmd(this)">Find Videos</button>
          </div>
        </div>
        <div class="card" style="padding:0;overflow:hidden">${sourcesHtml}</div>
        <div class="gr-submit-note">Run in Claude Code to find best videos</div>
      </div>

      <!-- SECTION 2 — Generate from Transcript -->
      <div class="gr-section">
        <div class="gr-section-header">
          <div class="gr-section-title">Generate from Transcript</div>
        </div>
        <div class="card">
          <div class="gr-form-grid">
            <input class="input w-full" id="gr-influencer" placeholder="Influencer name (e.g. Alex Hormozi)">
            <input class="input w-full" id="gr-title" placeholder="Video title">
            <input class="input w-full" id="gr-url" placeholder="Video URL (optional)">
            <input class="input w-full" id="gr-timestamp" placeholder="Best timestamp (e.g. 15:43-16:03)">
          </div>
          <textarea class="textarea" id="gr-quote" rows="2" placeholder="Quote to react to…" style="margin-top:8px"></textarea>
          <textarea class="textarea" id="gr-transcript" rows="8" placeholder="Paste full transcript here…" style="margin-top:8px"></textarea>
          <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
            <button class="btn" onclick="window.generateReactCmd()">Generate Command</button>
            <span id="gr-submit-status" class="text-xs text-muted"></span>
          </div>
          <div id="gr-cmd-output"></div>
          <div class="gr-submit-note" style="margin-top:8px">Paste into Claude Code to generate prompts</div>
        </div>
      </div>

      <!-- SECTION 3 — Generated Scripts -->
      <div class="gr-section">
        <div class="gr-section-header">
          <div class="gr-section-title">Generated Scripts</div>
          <span class="gr-section-count">${reactScripts.length} script${reactScripts.length === 1 ? '' : 's'}</span>
        </div>
        ${tableHtml}
      </div>`
  }

  // ── Copy: /research reaction-sources command ──────────────────
  window.copyReactionSourcesCmd = function (btn) {
    const cmd = '/research reaction-sources'
    navigator.clipboard.writeText(cmd).then(() => {
      btn.textContent = 'Copied!'
      btn.classList.add('copied')
      setTimeout(() => { btn.textContent = 'Find Videos'; btn.classList.remove('copied') }, 2000)
    }).catch(() => {})
  }

  // ── Generate: copyable /granny-reel react command ─────────────
  window.generateReactCmd = function () {
    const influencer = (document.getElementById('gr-influencer') || {}).value || ''
    const timestamp  = (document.getElementById('gr-timestamp')  || {}).value || ''
    const quote      = (document.getElementById('gr-quote')      || {}).value || ''
    const transcript = (document.getElementById('gr-transcript') || {}).value || ''
    const statusEl   = document.getElementById('gr-submit-status')
    const outputEl   = document.getElementById('gr-cmd-output')

    if (!influencer || !quote) {
      if (statusEl) statusEl.textContent = 'Influencer and quote are required'
      return
    }
    if (statusEl) statusEl.textContent = ''

    const transcriptPreview = transcript.slice(0, 100).replace(/"/g, '\\"')
    const suffix = transcript.length > 100 ? '...' : ''
    const cmd = `/granny-reel react "${influencer}" "${timestamp}" "${quote}" --transcript "${transcriptPreview}${suffix}"`

    if (!outputEl) return
    const uid = 'gr-react-' + Math.random().toString(36).slice(2, 7)
    outputEl.innerHTML = `
      <div style="margin-top:12px;border:1.5px solid var(--accent);border-radius:8px;padding:10px 12px">
        <div class="cmd-code-row" style="margin-bottom:4px;overflow:hidden">
          <span class="cmd-code" id="${uid}" style="white-space:normal;word-break:break-all;font-size:11px">${escHtml(cmd)}</span>
          <button class="cmd-copy-btn" onclick="window.copyField('${uid}',this)" style="flex-shrink:0">Copy</button>
        </div>
      </div>`
  }

  // ── Restore last sub-tab + re-render sub-tabs after data loads ─
  const _origLoadScripts = loadScripts
  loadScripts = async function () {
    await _origLoadScripts()
    // After data loads, re-render whichever sub-tab is active
    const activeSubTab = sessionStorage.getItem('activeSubTab') || 'all'
    if (activeSubTab !== 'all') activateSubTab(activeSubTab)
  }

  // Restore active sub-tab on page load
  const savedSubTab = sessionStorage.getItem('activeSubTab')
  if (savedSubTab && savedSubTab !== 'all') {
    // Defer until data is loaded — will be called by the overridden loadScripts above
    activateSubTab(savedSubTab)
  }

  loadScripts()
  window.scriptsRefresh = loadScripts
})()
