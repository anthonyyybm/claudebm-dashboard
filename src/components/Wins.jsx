import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate } from '../lib/utils.js'

const CAT_COLOR = { metric: 'yellow', content: 'accent', approval: 'green', system: 'purple' }

export default function Wins({ active }) {
  const [wins,    setWins]    = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState({ title: '', category: 'content', notes: '' })

  useEffect(() => { if (active) load() }, [active])

  async function load() {
    setLoading(true)
    const [{ data: w }, { data: t }] = await Promise.all([
      sb.from('wins').select('*').order('win_date', { ascending: false }),
      sb.from('tasks').select('id,title,category,created_at,updated_at').eq('is_win', true).order('updated_at', { ascending: false }),
    ])
    const winsRows = (w || []).map(r => ({ ...r, _source: 'win' }))
    const taskRows = (t || []).map(r => ({ id: r.id, title: r.title, category: r.category, win_date: r.updated_at, _source: 'task' }))
    const merged = [...winsRows, ...taskRows].sort((a, b) => new Date(b.win_date) - new Date(a.win_date))
    setWins(merged)
    setLoading(false)
  }

  async function logWin() {
    if (!form.title.trim()) return
    try {
      const { data, error } = await sb.from('wins').insert({ ...form, win_date: new Date().toISOString() }).select().single()
      if (error) throw error
      setWins(prev => [{ ...data, _source: 'win' }, ...prev])
      setModal(false)
      setForm({ title: '', category: 'content', notes: '' })
      showToast('Win logged!', 'success')
    } catch { showToast('Failed to log win', 'error') }
  }

  if (!active) return null

  return (
    <div className="tab-panel">
      <div className="flex-between mb-12">
        <div className="page-title" style={{ marginBottom: 0 }}>Wins</div>
        <button className="btn" onClick={() => setModal(true)}>+ Log Win</button>
      </div>

      {loading && <div className="skeleton h-big" />}

      <div className="wins-feed">
        {wins.map(w => (
          <div key={w.id + w._source} className="win-entry">
            <div className="win-date">{fmtDate(w.win_date || w.created_at)}</div>
            <div className="win-body">
              <div className="win-title">{w.title}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                {w.category && <span className={`badge ${CAT_COLOR[w.category] || 'gray'}`}>{w.category}</span>}
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text3)' }}>
                  {w._source === 'task' ? 'from task' : 'standalone'}
                </span>
              </div>
              {w.notes && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{w.notes}</div>}
            </div>
          </div>
        ))}
        {!loading && wins.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
            No wins yet — log the first one!
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-card" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Log a Win</div>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div>
                <div className="detail-label">Title</div>
                <input className="input w-full" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What did you win?" style={{ marginTop: 4 }} />
              </div>
              <div>
                <div className="detail-label">Category</div>
                <select className="input w-full" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ marginTop: 4 }}>
                  <option value="metric">Metric</option>
                  <option value="content">Content</option>
                  <option value="approval">Approval</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div>
                <div className="detail-label">Notes</div>
                <textarea className="textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Details..." style={{ marginTop: 4 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn" onClick={logWin}>Log Win</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
