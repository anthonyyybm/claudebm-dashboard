import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate } from '../lib/utils.js'

const STATUS_COLOR = { not_started: 'gray', in_progress: 'accent', hit: 'green' }

const EMPTY_FORM = { title: '', target_value: '', current_value: '0', unit: '', status: 'not_started', deadline: '', category: '', notes: '' }

export default function Goals({ active }) {
  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY_FORM)

  useEffect(() => { if (active) load() }, [active])

  async function load() {
    setLoading(true)
    const { data, error } = await sb.from('goals').select('*').order('created_at', { ascending: false })
    if (!error) setGoals(data || [])
    else showToast('Failed to load goals', 'error')
    setLoading(false)
  }

  async function updateGoal(id, patch) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g))
    const { error } = await sb.from('goals').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Update failed', 'error'); load() }
    else showToast('Saved', 'success')
  }

  async function createGoal() {
    if (!form.title.trim()) return
    const payload = {
      title:         form.title.trim(),
      target_value:  parseFloat(form.target_value) || null,
      current_value: parseFloat(form.current_value) || 0,
      unit:          form.unit.trim() || null,
      status:        form.status,
      deadline:      form.deadline || null,
      category:      form.category.trim() || null,
      notes:         form.notes.trim() || null,
    }
    const { data, error } = await sb.from('goals').insert(payload).select().single()
    if (error) { showToast('Failed to create goal', 'error'); return }
    setGoals(prev => [data, ...prev])
    setModal(false)
    setForm(EMPTY_FORM)
    showToast('Goal created', 'success')
  }

  async function deleteGoal(id) {
    if (!window.confirm('Delete this goal?')) return
    setGoals(prev => prev.filter(g => g.id !== id))
    const { error } = await sb.from('goals').delete().eq('id', id)
    if (error) { showToast('Delete failed', 'error'); load() }
    else showToast('Goal deleted', 'success')
  }

  if (!active) return null

  return (
    <div className="tab-panel">
      <div className="flex-between mb-12">
        <div className="page-title" style={{ marginBottom: 0 }}>Goals</div>
        <button className="btn" onClick={() => { setForm(EMPTY_FORM); setModal(true) }}>+ New Goal</button>
      </div>

      {/* Create Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">New Goal</div>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div>
                <div className="detail-label">Title <span style={{ color: 'var(--danger)' }}>*</span></div>
                <input className="input w-full" autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. TikTok 50 Followers" style={{ marginTop: 6 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <div className="detail-label">Target</div>
                  <input className="input w-full" type="number" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} placeholder="50" style={{ marginTop: 6 }} />
                </div>
                <div>
                  <div className="detail-label">Current</div>
                  <input className="input w-full" type="number" value={form.current_value} onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))} placeholder="0" style={{ marginTop: 6 }} />
                </div>
                <div>
                  <div className="detail-label">Unit</div>
                  <input className="input w-full" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="followers" style={{ marginTop: 6 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="detail-label">Status</div>
                  <select className="input w-full" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ marginTop: 6 }}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="hit">Hit</option>
                  </select>
                </div>
                <div>
                  <div className="detail-label">Deadline</div>
                  <input className="input w-full" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={{ marginTop: 6 }} />
                </div>
              </div>
              <div>
                <div className="detail-label">Category</div>
                <input className="input w-full" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. analytics" style={{ marginTop: 6 }} />
              </div>
              <div>
                <div className="detail-label">Notes</div>
                <textarea className="textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ marginTop: 6 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn" disabled={!form.title.trim()} onClick={createGoal}>Create Goal</button>
            </div>
          </div>
        </div>
      )}
      {loading
        ? <div className="goals-grid">{[1,2,3].map(i => <div key={i} className="skeleton h-big" style={{ borderRadius: 8, height: 160 }} />)}</div>
        : <div className="goals-grid">
            {goals.map(g => <GoalCard key={g.id} goal={g} onUpdate={updateGoal} onDelete={deleteGoal} />)}
          </div>
      }
    </div>
  )
}

function GoalCard({ goal, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [val,     setVal]     = useState(goal.current_value ?? 0)
  const [status,  setStatus]  = useState(goal.status)
  const [notes,   setNotes]   = useState(goal.notes || '')

  const pct = goal.target_value > 0 ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100)) : 0

  const deadline = goal.deadline ? new Date(goal.deadline) : null
  const daysLeft = deadline ? Math.ceil((deadline - Date.now()) / 86400000) : null
  const deadlineColor = daysLeft !== null && daysLeft < 7 ? (daysLeft < 0 ? 'var(--danger)' : 'var(--yellow)') : 'var(--text3)'

  function save() {
    onUpdate(goal.id, { current_value: parseFloat(val) || 0, status, notes })
    setEditing(false)
  }

  return (
    <div className="goal-card">
      <div className="goal-title">{goal.title}</div>

      <div className="goal-progress-track">
        <div className="goal-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="goal-values">
        <span>{goal.current_value ?? 0}</span> / {goal.target_value} {goal.unit}
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)' }}>({pct}%)</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className={`badge ${STATUS_COLOR[goal.status] || 'gray'}`}>{goal.status?.replace('_', ' ')}</span>
        {daysLeft !== null && (
          <span style={{ fontSize: 11, color: deadlineColor }}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
          </span>
        )}
      </div>

      {!editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, flex: 1 }} onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => onDelete(goal.id)}>Delete</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <div className="detail-label">Current Value</div>
            <input className="input w-full" type="number" value={val} onChange={e => setVal(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <div className="detail-label">Status</div>
            <select className="input w-full" value={status} onChange={e => setStatus(e.target.value)} style={{ marginTop: 4 }}>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="hit">Hit</option>
            </select>
          </div>
          <div>
            <div className="detail-label">Notes</div>
            <textarea className="textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ marginTop: 4 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" style={{ flex: 1 }} onClick={save}>Save</button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
