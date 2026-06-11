import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import { fmtDate } from '../lib/utils.js'

/* ─── Helpers ────────────────────────────────────────────────── */
function escHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function abbrevSeries(s) {
  if (!s) return '—'
  if (s.includes('Marketing')) return 'Marketing'
  if (s.includes('Sales'))     return 'Sales'
  if (s.includes('Customer'))  return 'Cx Gaps'
  return s.slice(0, 14)
}
const STATUS_COLOR = { Ready: 'green', Draft: 'amber', Used: 'gray', Flagged: 'red' }
function contentTypeBadge(type) {
  const m = { 'Granny First': 'purple', 'Granny Watches': 'blue', 'Creative Commercial': 'coral', 'Granny Reacts': 'amber', 'Walking Scene': 'green', 'Natural Interaction': 'teal', 'Mistake First': 'blue', 'Granny Selfie': 'pink' }
  return type ? <span className={`badge ${m[type] || 'gray'}`}>{type}</span> : <span className="badge gray">—</span>
}
function ccBadge(cc) {
  if (cc === 'Passed')  return <span className="badge green">✓ Pass</span>
  if (cc === 'Flagged') return <span className="badge red">⚠ Flag</span>
  return <span className="badge gray">—</span>
}
function Dot({ val }) { return <span className={`dot ${val ? 'accent' : 'gray'}`} /> }

const SUB_TABS = [
  { id: 'all',                label: 'All' },
  { id: 'granny-first',       label: 'Granny First' },
  { id: 'granny-watches',     label: 'Granny Watches' },
  { id: 'walking-scene',      label: 'Walking Scene' },
  { id: 'natural-interaction',label: 'Natural Interaction' },
  { id: 'creative-commercial',label: 'Creative Commercial' },
  { id: 'granny-reacts',      label: 'Granny Reacts' },
  { id: 'granny-selfie',      label: 'Granny Selfie' },
]
const SUB_TAB_TYPES = {
  'granny-first':        'Granny First',
  'granny-watches':      'Granny Watches',
  'walking-scene':       'Walking Scene',
  'natural-interaction': 'Natural Interaction',
  'creative-commercial': 'Creative Commercial',
  'granny-reacts':       'Granny Reacts',
  'granny-selfie':       'Granny Selfie',
}

export default function Reels({ active }) {
  const [scripts,    setScripts]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('All')
  const [search,     setSearch]     = useState('')
  const [sort,       setSort]       = useState('newest')
  const [page,       setPage]       = useState(1)
  const [pageSize,   setPageSize]   = useState(10)
  const [selected,   setSelected]   = useState(new Set())
  const [subTab,     setSubTab]     = useState('all')
  const [modal,      setModal]      = useState(null) // script object

  const loadScripts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await sb.from('scripts').select('*').eq('is_archived', false).order('created_at', { ascending: false })
    if (!error) { setScripts(data || []); setPage(1); setSelected(new Set()) }
    else showToast('Failed to load scripts', 'error')
    setLoading(false)
  }, [])

  useEffect(() => { if (active) loadScripts() }, [active, loadScripts])

  function getFiltered(overrideType) {
    let rows = scripts
    if (overrideType) rows = rows.filter(s => s.content_type === overrideType)
    if (filter !== 'All') {
      if (filter === 'Flagged') rows = rows.filter(s => s.consistency_check === 'Flagged')
      else rows = rows.filter(s => s.status === filter)
    }
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(s => (s.topic || '').toLowerCase().includes(q) || (s.series || '').toLowerCase().includes(q))
    }
    rows = [...rows]
    switch (sort) {
      case 'oldest':       rows.sort((a, b) => (a.created_at||'').localeCompare(b.created_at||'')); break
      case 'series':       rows.sort((a, b) => (a.series||'').localeCompare(b.series||'')); break
      case 'content_type': rows.sort((a, b) => (a.content_type||'').localeCompare(b.content_type||'')); break
      case 'status':       { const o = {Draft:0,Ready:1,Used:2}; rows.sort((a,b) => (o[a.status]??3)-(o[b.status]??3)); break }
      case 'relevance':    rows.sort((a, b) => (a.consistency_check==='Passed'?0:1)-(b.consistency_check==='Passed'?0:1)); break
      default:             rows.sort((a, b) => (b.created_at||'').localeCompare(a.created_at||''))
    }
    return rows
  }

  function paginate(rows) {
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const p = Math.min(page, totalPages)
    const start = (p - 1) * pageSize
    return { rows: rows.slice(start, start + pageSize), total, totalPages, start, curPage: p }
  }

  async function markReady(id) {
    setScripts(prev => prev.map(s => s.id === id ? { ...s, status: 'Ready' } : s))
    await sb.from('scripts').update({ status: 'Ready' }).eq('id', id)
    setModal(prev => prev?.id === id ? { ...prev, status: 'Ready' } : prev)
    showToast('Marked Ready', 'success')
  }
  async function markUsed(id) {
    const now = new Date().toISOString()
    setScripts(prev => prev.map(s => s.id === id ? { ...s, status: 'Used', used_at: now } : s))
    await sb.from('scripts').update({ status: 'Used', used_at: now }).eq('id', id)
    setModal(prev => prev?.id === id ? { ...prev, status: 'Used', used_at: now } : prev)
    showToast('Marked Used', 'success')
  }
  async function deleteScript(id) {
    if (!await confirmDialog('Delete this script? This cannot be undone.', { danger: true, confirmLabel: 'Delete' })) return
    setScripts(prev => prev.filter(s => s.id !== id))
    setModal(null)
    await sb.from('scripts').delete().eq('id', id)
    showToast('Deleted', 'success')
  }

  async function bulkMarkReady() {
    const ids = [...selected]; if (!ids.length) return
    setScripts(prev => prev.map(s => ids.includes(s.id) ? { ...s, status: 'Ready' } : s))
    await sb.from('scripts').update({ status: 'Ready' }).in('id', ids)
    setSelected(new Set())
    showToast(`${ids.length} marked Ready`, 'success')
  }
  async function bulkMarkUsed() {
    const ids = [...selected]; if (!ids.length) return
    const now = new Date().toISOString()
    setScripts(prev => prev.map(s => ids.includes(s.id) ? { ...s, status: 'Used', used_at: now } : s))
    await sb.from('scripts').update({ status: 'Used', used_at: now }).in('id', ids)
    setSelected(new Set())
    showToast(`${ids.length} marked Used`, 'success')
  }
  async function bulkDelete() {
    const ids = [...selected]; if (!ids.length) return
    if (!await confirmDialog(`Delete ${ids.length} scripts?`, { danger: true, confirmLabel: 'Delete' })) return
    setScripts(prev => prev.filter(s => !ids.includes(s.id)))
    setSelected(new Set())
    await sb.from('scripts').delete().in('id', ids)
    showToast(`${ids.length} deleted`, 'success')
  }
  async function queueRegenerate(ids) {
    try {
      await sb.from('requests').insert({ type: 'regenerate-prompts', status: 'pending', payload: { script_ids: ids }, created_at: new Date().toISOString() })
      showToast('Regeneration queued', 'info')
    } catch { showToast('Failed to queue', 'error') }
  }
  async function queueBatchCheck() {
    try {
      await sb.from('requests').insert({ type: 'consistency-check-batch', status: 'pending', created_at: new Date().toISOString() })
      showToast('Batch check queued', 'info')
    } catch { showToast('Failed to queue', 'error') }
  }
  async function queueSingleCheck(id) {
    try {
      await sb.from('requests').insert({ type: 'consistency-check', status: 'pending', payload: { script_id: id }, created_at: new Date().toISOString() })
      showToast('Check queued', 'info')
    } catch { showToast('Failed to queue', 'error') }
  }
  async function generateBatch() {
    try {
      await sb.from('requests').insert({ type: 'generate-scripts', status: 'pending', payload: { reason: 'manual-request', forced: true }, created_at: new Date().toISOString() })
      showToast('Batch generation queued — Claude Code will process this shortly', 'info')
    } catch { showToast('Failed to queue', 'error') }
  }

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll(pageRows) {
    const pageIds = pageRows.map(s => s.id)
    const allSel = pageIds.every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      if (allSel) pageIds.forEach(id => n.delete(id))
      else pageIds.forEach(id => n.add(id))
      return n
    })
  }

  if (!active) return null

  return (
    <div className="tab-panel">
      {/* Header */}
      <div className="flex-between mb-12">
        <div style={{ fontSize: 15, fontWeight: 600 }}>Script Pipeline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn" onClick={generateBatch}>Generate New Batch</button>
          <button className="btn" onClick={queueBatchCheck}>Check All Drafts</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="sub-tab-bar">
        {SUB_TABS.map(t => (
          <button key={t.id} className={`sub-tab${subTab === t.id ? ' active' : ''}`} onClick={() => { setSubTab(t.id); setPage(1) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        {['All','Draft','Ready','Used','Flagged'].map(f => (
          <button key={f} className={`filter-btn${filter === f ? ' active' : ''}`} onClick={() => { setFilter(f); setPage(1) }}>{f}</button>
        ))}
        <select className={`input sort-select${sort !== 'newest' ? ' sort-active' : ''}`} value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="series">Series A-Z</option>
          <option value="content_type">Content type</option>
          <option value="status">Status</option>
          <option value="relevance">Relevance</option>
        </select>
        <input className="input" type="text" placeholder="Search topic…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ marginLeft: 'auto', width: 200 }} />
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar visible">
          <span className="bulk-count">{selected.size} script{selected.size !== 1 ? 's' : ''} selected</span>
          <button className="btn" onClick={bulkMarkReady}>Mark Ready</button>
          <button className="btn btn-ghost" onClick={bulkMarkUsed}>Mark Used</button>
          <button className="btn" onClick={() => queueRegenerate([...selected])}>Regenerate Prompts</button>
          <button className="btn btn-danger" onClick={bulkDelete}>Delete Selected</button>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelected(new Set())}>✕</button>
        </div>
      )}

      {loading && <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />}

      {/* All tab — full table */}
      {!loading && subTab === 'all' && (
        <AllTable
          rows={getFiltered()}
          page={page} pageSize={pageSize} paginate={paginate}
          selected={selected} toggleSelect={toggleSelect} toggleSelectAll={toggleSelectAll}
          setPage={setPage} setPageSize={setPageSize}
          openModal={s => setModal(s)}
        />
      )}

      {/* Granny Reacts */}
      {!loading && subTab === 'granny-reacts' && (
        <GrannyReacts
          scripts={scripts} filter={getFiltered('Granny Reacts')}
          paginate={paginate} page={page} pageSize={pageSize}
          setPage={setPage} openModal={s => setModal(s)}
        />
      )}

      {/* Creative Commercial */}
      {!loading && subTab === 'creative-commercial' && (
        <CommercialCards
          rows={getFiltered('Creative Commercial')}
          paginate={paginate} page={page} pageSize={pageSize}
          setPage={setPage} openModal={s => setModal(s)}
        />
      )}

      {/* Generic type panels */}
      {!loading && SUB_TAB_TYPES[subTab] && subTab !== 'granny-reacts' && subTab !== 'creative-commercial' && (
        <TypePanel
          type={SUB_TAB_TYPES[subTab]}
          rows={getFiltered(SUB_TAB_TYPES[subTab])}
          paginate={paginate} page={page} pageSize={pageSize}
          setPage={setPage} openModal={s => setModal(s)}
        />
      )}

      {/* Script Modal */}
      {modal && (
        <ScriptModal
          script={modal}
          onClose={() => setModal(null)}
          onMarkReady={markReady}
          onMarkUsed={markUsed}
          onDelete={deleteScript}
          onRegenerate={id => queueRegenerate([id])}
          onCheck={queueSingleCheck}
          onFieldSave={async (id, field, val) => {
            setScripts(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s))
            setModal(prev => prev ? { ...prev, [field]: val } : prev)
            const { error } = await sb.from('scripts').update({ [field]: val }).eq('id', id)
            if (error) showToast('Save failed', 'error')
            else showToast('Saved', 'success')
          }}
        />
      )}
    </div>
  )
}

/* ─── All Table ──────────────────────────────────────────────── */
function AllTable({ rows, page, pageSize, paginate, selected, toggleSelect, toggleSelectAll, setPage, setPageSize, openModal }) {
  const { rows: paged, total, totalPages, start, curPage } = paginate(rows)
  const allPageSel = paged.length > 0 && paged.every(s => selected.has(s.id))
  const somePageSel = paged.some(s => selected.has(s.id))

  return (
    <div className="card">
      <div className="flex-between mb-12">
        <div className="text-xs text-muted">
          {total === 0 ? 'No scripts match' : `Showing ${start+1}–${Math.min(start+pageSize,total)} of ${total} scripts`}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30, padding: '8px 4px 8px 10px' }}>
                <input type="checkbox" checked={allPageSel} ref={el => { if (el) el.indeterminate = !allPageSel && somePageSel }} onChange={() => toggleSelectAll(paged)} />
              </th>
              <th>Topic</th><th>Series</th><th>Format</th><th>Status</th><th>Check</th>
              <th title="Img">Img</th><th title="V1">V1</th><th title="V2">V2</th><th title="V3">V3</th><th title="V4">V4</th>
              <th title="CTA">CTA</th><th title="Cap">Cap</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr><td colSpan={14} className="text-muted text-sm" style={{ padding: 16 }}>No scripts match this filter.</td></tr>
            )}
            {paged.map(s => (
              <tr key={s.id} className="script-table-row" onClick={() => openModal(s)}>
                <td onClick={e => e.stopPropagation()} style={{ padding: '8px 4px 8px 10px', width: 30 }}>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} onClick={e => e.stopPropagation()} />
                </td>
                <td className="script-topic" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic || '—'}</td>
                <td className="text-xs text-muted">{abbrevSeries(s.series)}</td>
                <td>{contentTypeBadge(s.content_type)}</td>
                <td><span className={`badge ${STATUS_COLOR[s.status] || 'gray'}`}>{s.status || '—'}</span></td>
                <td>{ccBadge(s.consistency_check)}</td>
                <td><Dot val={s.image_prompt || s.image_prompts} /></td>
                <td><Dot val={s.video_prompt_p1} /></td>
                <td><Dot val={s.video_prompt_p2} /></td>
                <td><Dot val={s.video_prompt_p3} /></td>
                <td><Dot val={s.video_prompt_p4} /></td>
                <td><Dot val={s.cta_prompt} /></td>
                <td><Dot val={s.caption_tiktok} /></td>
                <td className="text-xs text-muted">{fmtDate(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination total={total} totalPages={totalPages} page={curPage} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
    </div>
  )
}

/* ─── Type Panel (generic per-type table) ────────────────────── */
function TypePanel({ type, rows, paginate, page, pageSize, setPage, openModal }) {
  const { rows: paged, total, totalPages, start, curPage } = paginate(rows)
  if (total === 0) return <div className="gr-empty">No {type} scripts match this filter</div>
  return (
    <>
      <div className="type-panel-header">
        <span className="type-panel-count">Showing {start+1}–{Math.min(start+pageSize,total)} of {total} script{total===1?'':'s'}</span>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Topic</th><th>Series</th><th>Status</th><th>Check</th><th>Img</th><th>V1</th><th>V2</th><th>V3</th><th>CTA</th><th>Cap</th><th>Date</th></tr>
            </thead>
            <tbody>
              {paged.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openModal(s)}>
                  <td className="script-topic" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic||'—'}</td>
                  <td className="text-xs text-muted">{abbrevSeries(s.series)}</td>
                  <td><span className={`badge ${STATUS_COLOR[s.status]||'gray'}`}>{s.status||'—'}</span></td>
                  <td>{ccBadge(s.consistency_check)}</td>
                  <td><Dot val={s.image_prompt||s.image_prompts} /></td>
                  <td><Dot val={s.video_prompt_p1} /></td><td><Dot val={s.video_prompt_p2} /></td><td><Dot val={s.video_prompt_p3} /></td>
                  <td><Dot val={s.cta_prompt} /></td><td><Dot val={s.caption_tiktok} /></td>
                  <td className="text-xs text-muted">{fmtDate(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={total} totalPages={totalPages} page={curPage} pageSize={pageSize} setPage={setPage} />
      </div>
    </>
  )
}

/* ─── Commercial Cards ───────────────────────────────────────── */
function CommercialCards({ rows, paginate, page, pageSize, setPage, openModal }) {
  const { rows: paged, total, totalPages, start, curPage } = paginate(rows)
  if (total === 0) return <div className="gr-empty">No Creative Commercial scripts match this filter</div>
  return (
    <>
      <div className="text-xs text-muted mb-12">Showing {start+1}–{Math.min(start+pageSize,total)} of {total}</div>
      <div className="cc-cards-grid">
        {paged.map(s => {
          const hook = (s.hook || '').slice(0, 80)
          const imgPrev = ((s.image_prompts||s.image_prompt||'').replace(/\[START FRAME[^\]]*\]/gi,'').trim()).slice(0,60)
          return (
            <div key={s.id} className="cc-card" onClick={() => openModal(s)}>
              <div className="cc-card-hook">{hook}{(s.hook||'').length>80?'…':''}</div>
              <div className="cc-card-meta">
                <span className="badge coral">{s.series||'Commercial'}</span>
                <span className={`badge ${STATUS_COLOR[s.status]||'gray'}`}>{s.status||'—'}</span>
                {ccBadge(s.consistency_check)}
              </div>
              {imgPrev && <div className="cc-card-preview">{imgPrev}…</div>}
              <div className="text-xs text-muted" style={{ marginTop: 8 }}>{fmtDate(s.created_at)}</div>
            </div>
          )
        })}
      </div>
      <Pagination total={total} totalPages={totalPages} page={curPage} pageSize={pageSize} setPage={setPage} />
    </>
  )
}

/* ─── Granny Reacts ──────────────────────────────────────────── */
function GrannyReacts({ filter, paginate, page, pageSize, setPage, openModal }) {
  const [cmd, setCmd] = useState('')
  const { rows: paged, total, totalPages, start, curPage } = paginate(filter)

  function parseInfluencer(topic) { if (!topic) return '—'; const p=topic.split(' — '); return p.length>1?p[0].trim():topic.slice(0,20) }
  function parseQuote(topic)      { if (!topic) return '—'; const i=topic.indexOf(' — '); return i!==-1?topic.slice(i+3):topic }

  function generateCmd() {
    const inf = document.getElementById('gr-influencer')?.value||''
    const ts  = document.getElementById('gr-timestamp')?.value||''
    const qt  = document.getElementById('gr-quote')?.value||''
    const tr  = document.getElementById('gr-transcript')?.value||''
    if (!inf||!qt) { showToast('Influencer and quote are required','error'); return }
    const prev = tr.slice(0,100).replace(/"/g,'\\"')
    const suf  = tr.length>100?'...':''
    setCmd(`/granny-reel react "${inf}" "${ts}" "${qt}" --transcript "${prev}${suf}"`)
  }

  return (
    <div>
      <div className="gr-section">
        <div className="gr-section-header">
          <div className="gr-section-title">Source Videos</div>
          <button className="btn" onClick={() => { navigator.clipboard.writeText('/research reaction-sources'); showToast('Copied!','success') }}>Find Videos</button>
        </div>
        {paged.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Influencer</th><th>Quote preview</th><th>Reference</th><th>Status</th></tr></thead>
                <tbody>
                  {paged.map(s => (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openModal(s)}>
                      <td className="text-xs" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{parseInfluencer(s.topic)}</td>
                      <td className="text-xs" style={{ maxWidth: 200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text2)' }}>{parseQuote(s.topic)}</td>
                      <td className="text-xs" style={{ maxWidth: 180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.reaction_reference || '—'}</td>
                      <td><span className={`badge ${STATUS_COLOR[s.status]||'gray'}`}>{s.status||'—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="gr-submit-note">Run in Claude Code to find best videos</div>
      </div>

      <div className="gr-section">
        <div className="gr-section-header"><div className="gr-section-title">Generate from Transcript</div></div>
        <div className="card">
          <div className="gr-form-grid">
            <input className="input w-full" id="gr-influencer" placeholder="Influencer name" />
            <input className="input w-full" id="gr-title"      placeholder="Video title" />
            <input className="input w-full" id="gr-url"        placeholder="Video URL (optional)" />
            <input className="input w-full" id="gr-timestamp"  placeholder="Best timestamp (e.g. 15:43)" />
          </div>
          <textarea className="textarea" id="gr-quote" rows={2} placeholder="Quote to react to…" style={{ marginTop: 8 }} />
          <textarea className="textarea" id="gr-transcript" rows={6} placeholder="Paste full transcript here…" style={{ marginTop: 8 }} />
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={generateCmd}>Generate Command</button>
          </div>
          {cmd && (
            <div style={{ marginTop: 10, border: '1.5px solid var(--cyan)', borderRadius: 8, padding: '10px 12px' }}>
              <div className="cmd-code-row">
                <span className="cmd-code" style={{ fontSize: 11, wordBreak: 'break-all' }}>{cmd}</span>
                <button className="cmd-copy-btn" onClick={() => { navigator.clipboard.writeText(cmd); showToast('Copied!','success') }}>Copy</button>
              </div>
            </div>
          )}
          <div className="gr-submit-note" style={{ marginTop: 8 }}>Paste into Claude Code to generate prompts</div>
        </div>
      </div>

      <div className="gr-section">
        <div className="gr-section-header">
          <div className="gr-section-title">Generated Scripts</div>
          <span className="gr-section-count">{total} script{total===1?'':'s'}</span>
        </div>
        {total === 0
          ? <div className="gr-empty">No scripts yet — generate one from a transcript above</div>
          : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Quote / Topic</th><th>Influencer</th><th>Series</th><th>Status</th><th>Check</th><th>Img</th><th>V1</th><th>V2</th><th>V3</th><th>CTA</th><th>Cap</th><th>Date</th></tr></thead>
                  <tbody>
                    {paged.map(s => (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openModal(s)}>
                        <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{parseQuote(s.topic)||'—'}</td>
                        <td className="text-xs" style={{ whiteSpace:'nowrap' }}>{parseInfluencer(s.topic)}</td>
                        <td className="text-xs text-muted">{abbrevSeries(s.series)}</td>
                        <td><span className={`badge ${STATUS_COLOR[s.status]||'gray'}`}>{s.status||'—'}</span></td>
                        <td>{ccBadge(s.consistency_check)}</td>
                        <td><Dot val={s.image_prompt||s.image_prompts} /></td>
                        <td><Dot val={s.video_prompt_p1} /></td><td><Dot val={s.video_prompt_p2} /></td><td><Dot val={s.video_prompt_p3} /></td>
                        <td><Dot val={s.cta_prompt} /></td><td><Dot val={s.caption_tiktok} /></td>
                        <td className="text-xs text-muted">{fmtDate(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={total} totalPages={totalPages} page={curPage} pageSize={pageSize} setPage={setPage} />
            </div>
          )
        }
      </div>
    </div>
  )
}

/* ─── Pagination ─────────────────────────────────────────────── */
function Pagination({ total, totalPages, page, pageSize, setPage, setPageSize }) {
  if (total === 0) return null
  return (
    <div className="pagination-row">
      <div className="pagination-controls">
        <button className="page-btn" disabled={page<=1} onClick={() => setPage(p => p-1)}>Previous</button>
        {totalPages <= 20 && Array.from({length: totalPages}, (_, i) => (
          <button key={i+1} className={`page-btn${page===i+1?' active':''}`} onClick={() => setPage(i+1)}>{i+1}</button>
        ))}
        {totalPages > 20 && <span className="text-xs text-muted" style={{padding:'0 6px'}}>Page {page} of {totalPages}</span>}
        <button className="page-btn" disabled={page>=totalPages} onClick={() => setPage(p => p+1)}>Next</button>
      </div>
      {setPageSize && (
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span className="text-xs text-muted">Per page:</span>
          {[10,25,50].map(n => (
            <button key={n} className={`page-btn${pageSize===n?' active':''}`} onClick={() => setPageSize(n)}>{n}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Script Modal ───────────────────────────────────────────── */
function ScriptModal({ script: s, onClose, onMarkReady, onMarkUsed, onDelete, onRegenerate, onCheck, onFieldSave }) {
  const [rating, setRating] = useState(null)
  const [note,   setNote]   = useState('')
  const [fbCmd,  setFbCmd]  = useState('')

  function genFbCmd() {
    if (!rating) return
    const shortId = s.id.slice(0,8)
    setFbCmd(note ? `/feedback ${rating} ${shortId} "${note}"` : `/feedback ${rating} ${shortId}`)
  }

  function copyAll() {
    const sep = '\n' + '─'.repeat(60) + '\n'
    const parts = []
    if (s.topic) parts.push(`TOPIC: ${s.topic}`)
    const script = [s.hook, s.script_part1, s.script_part2].filter(Boolean).join('\n\n')
    if (script) parts.push(`SCRIPT:\n${script}`)
    if (s.image_prompt) parts.push(`IMAGE PROMPT:\n${s.image_prompt}`)
    if (s.video_prompt_p1) parts.push(`VIDEO PROMPT P1:\n${s.video_prompt_p1}`)
    if (s.video_prompt_p2) parts.push(`VIDEO PROMPT P2:\n${s.video_prompt_p2}`)
    if (s.cta_prompt) parts.push(`CTA:\n${s.cta_prompt}`)
    if (s.caption_tiktok) parts.push(`CAPTION TIKTOK:\n${s.caption_tiktok}`)
    if (s.caption_instagram) parts.push(`CAPTION IG:\n${s.caption_instagram}`)
    navigator.clipboard.writeText(parts.join(sep))
    showToast('Copied all', 'success')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{s.topic || '—'}</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
              <span className={`badge ${STATUS_COLOR[s.status]||'gray'}`}>{s.status||'—'}</span>
              <span className="badge gray">{abbrevSeries(s.series)}</span>
              {contentTypeBadge(s.content_type)}
              {ccBadge(s.consistency_check)}
            </div>
            <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'var(--text3)', marginTop:4 }}>ID: {s.id?.slice(0,8)}…</div>
          </div>
          <button className="copy-btn" onClick={copyAll} style={{ alignSelf:'flex-start', flexShrink:0 }}>Copy All</button>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <EditableField label="Script" value={[s.hook, s.script_part1, s.script_part2].filter(Boolean).join('\n\n')} mono />

          {/* Image prompts */}
          {(s.image_prompts||s.image_prompt) && <ImageFields script={s} onSave={onFieldSave} />}

          {/* Video prompts */}
          <VideoFields script={s} onSave={onFieldSave} />

          {s.cta_prompt      && <EditableField label="CTA Prompt"            value={s.cta_prompt}      field="cta_prompt"      scriptId={s.id} onSave={onFieldSave} />}
          {s.platform_notes  && <EditableField label="Platform Notes"        value={s.platform_notes}  field="platform_notes"  scriptId={s.id} onSave={onFieldSave} />}
          {s.caption_tiktok  && <EditableField label="Caption — TikTok"      value={s.caption_tiktok}  field="caption_tiktok"  scriptId={s.id} onSave={onFieldSave} />}
          {s.caption_instagram && <EditableField label="Caption — Instagram"  value={s.caption_instagram} field="caption_instagram" scriptId={s.id} onSave={onFieldSave} />}

          {/* Consistency */}
          <div className="modal-section">
            <div className="detail-label">Consistency</div>
            {s.consistency_check === 'Passed' && <div style={{ color:'var(--success)', fontSize:12, padding:'6px 0' }}>✓ Passed all checks</div>}
            {s.consistency_check === 'Flagged' && (
              <div style={{ color:'var(--danger)', fontSize:12 }}>
                ⚠ Issues found
                {Array.isArray(s.consistency_flags) && s.consistency_flags.map((f,i) => (
                  <div key={i} style={{ fontSize:11, color:'var(--text2)', padding:'3px 0', borderBottom:'1px solid var(--border)' }}>• {f}</div>
                ))}
              </div>
            )}
            {!s.consistency_check && (
              <button className="btn" style={{ fontSize:11 }} onClick={() => onCheck(s.id)}>Run Check</button>
            )}
          </div>

          {/* Feedback */}
          <div className="feedback-section">
            <div className="feedback-label">Feedback</div>
            <div className="feedback-btns">
              <button className={`feedback-btn${rating==='good'?' selected-good':''}`} onClick={() => setRating('good')}>👍 Good</button>
              <button className={`feedback-btn${rating==='bad'?' selected-bad':''}`}  onClick={() => setRating('bad')}>👎 Bad</button>
            </div>
            {rating && (
              <div style={{ marginTop: 8 }}>
                <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)" style={{ fontSize:12 }} />
                <button className="btn" style={{ marginTop:6, width:'100%' }} onClick={genFbCmd}>Generate Command</button>
              </div>
            )}
            {fbCmd && (
              <div style={{ marginTop:10, border:`1.5px solid ${rating==='good'?'var(--success)':'var(--danger)'}`, borderRadius:8, padding:'10px 12px' }}>
                <div className="cmd-code-row">
                  <span className="cmd-code" style={{ fontSize:11 }}>{fbCmd}</span>
                  <button className="cmd-copy-btn" onClick={() => { navigator.clipboard.writeText(fbCmd); showToast('Copied!','success') }}>Copy</button>
                </div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Paste into Claude Code to process feedback</div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-footer-inner">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {s.status !== 'Ready' && <button className="btn" onClick={() => { onMarkReady(s.id); onClose() }}>Mark Ready</button>}
              {s.status !== 'Used'  && <button className="btn btn-ghost" onClick={() => { onMarkUsed(s.id); onClose() }}>Mark Used</button>}
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { onRegenerate(s.id); onClose() }}>↻ Regenerate</button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div className="text-xs text-muted">{fmtDate(s.created_at)}</div>
              <button className="btn btn-danger" onClick={() => onDelete(s.id)}>Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Editable Field ─────────────────────────────────────────── */
function EditableField({ label, value, field, scriptId, onSave, mono }) {
  const [editing, setEditing] = useState(false)
  const [val,     setVal]     = useState(value || '')
  if (!value) return null
  const cls = `detail-text${mono?' detail-text-mono':''}`
  return (
    <div className="modal-section">
      <div className="modal-section-header">
        <div className="detail-label">{label}</div>
        <div style={{ display:'flex', gap:4 }}>
          <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(value); showToast('Copied!','success') }}>Copy</button>
          {field && !editing && <button className="copy-btn" onClick={() => setEditing(true)}>Edit</button>}
          {editing && <button className="copy-btn" onClick={() => { setEditing(false); setVal(value) }}>Cancel</button>}
          {editing && <button className="copy-btn" onClick={async () => { await onSave(scriptId, field, val); setEditing(false) }}>Save</button>}
        </div>
      </div>
      {editing
        ? <textarea className="field-textarea" value={val} onChange={e => setVal(e.target.value)} />
        : <div className={cls}>{value}</div>
      }
    </div>
  )
}

/* ─── Image Fields ───────────────────────────────────────────── */
function ImageFields({ script: s, onSave }) {
  const src = s.image_prompts || s.image_prompt || ''
  const endIdx = src.search(/\[END FRAME/i)
  if (endIdx === -1) return <EditableField label="Image Prompt" value={src} field="image_prompt" scriptId={s.id} onSave={onSave} />
  const start = src.substring(0, endIdx).trim()
  const end   = src.substring(endIdx).trim()
  return (
    <>
      <EditableField label="Image Prompt — Start Frame" value={start} />
      <EditableField label="Image Prompt — End Frame"   value={end}   field="image_prompt" scriptId={s.id} onSave={onSave} />
    </>
  )
}

/* ─── Video Fields ───────────────────────────────────────────── */
function VideoFields({ script: s, onSave }) {
  if (s.video_prompts) {
    const parts  = s.video_prompts.split(/\n---VIDEO BREAK---\n/)
    const labels = ['Video P1','Video P2','Video P3','Video P4']
    const fields = ['video_prompt_p1','video_prompt_p2','video_prompt_p3','video_prompt_p4']
    return <>{parts.map((p, i) => <EditableField key={i} label={labels[i]||`Video P${i+1}`} value={p.trim()} field={fields[i]||null} scriptId={s.id} onSave={onSave} />)}</>
  }
  return (
    <>
      {s.video_prompt_p1 && <EditableField label="Video P1" value={s.video_prompt_p1} field="video_prompt_p1" scriptId={s.id} onSave={onSave} />}
      {s.video_prompt_p2 && <EditableField label="Video P2" value={s.video_prompt_p2} field="video_prompt_p2" scriptId={s.id} onSave={onSave} />}
      {s.video_prompt_p3 && <EditableField label="Video P3" value={s.video_prompt_p3} field="video_prompt_p3" scriptId={s.id} onSave={onSave} />}
      {s.video_prompt_p4 && <EditableField label="Video P4" value={s.video_prompt_p4} field="video_prompt_p4" scriptId={s.id} onSave={onSave} />}
    </>
  )
}
