import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import { fmtDate } from '../lib/utils.js'

const STATUS_COLOR  = { not_started: 'gray', in_progress: 'accent', hit: 'green' }
const EMPTY_FORM    = { title: '', target_value: '', current_value: '0', unit: '', status: 'not_started', deadline: '', category: '', notes: '' }

export default function Goals({ active }) {
  const [goals,    setGoals]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [newModal, setNewModal] = useState(false)
  const [editGoal, setEditGoal] = useState(null)   // goal object to edit in modal
  const [form,     setForm]     = useState(EMPTY_FORM)

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
    setEditGoal(prev => prev?.id === id ? { ...prev, ...patch } : prev)
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
    setNewModal(false)
    setForm(EMPTY_FORM)
    showToast('Goal created', 'success')
  }

  async function deleteGoal(id) {
    if (!await confirmDialog('Delete this goal?', { danger: true, confirmLabel: 'Delete' })) return
    setGoals(prev => prev.filter(g => g.id !== id))
    setEditGoal(null)
    const { error } = await sb.from('goals').delete().eq('id', id)
    if (error) { showToast('Delete failed', 'error'); load() }
    else showToast('Goal deleted', 'success')
  }

  if (!active) return null

  return (
    <div className="tab-panel">
      <div className="flex-between mb-12">
        <div className="page-title" style={{ marginBottom: 0 }}>Goals</div>
        <button className="btn" onClick={() => { setForm(EMPTY_FORM); setNewModal(true) }}>+ New Goal</button>
      </div>

      {loading
        ? <div className="goals-grid">{[1,2,3].map(i => <div key={i} className="skeleton" style={{ borderRadius: 8, height: 160 }} />)}</div>
        : <div className="goals-grid">
            {goals.map(g => (
              <GoalCard key={g.id} goal={g} onClick={() => setEditGoal(g)} onDelete={deleteGoal} />
            ))}
          </div>
      }

      {/* New goal modal */}
      {newModal && (
        <div className="modal-overlay" onClick={() => setNewModal(false)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">New Goal</div>
              <button className="modal-close" onClick={() => setNewModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <GoalForm form={form} setForm={setForm} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setNewModal(false)}>Cancel</button>
              <button className="btn" disabled={!form.title.trim()} onClick={createGoal}>Create Goal</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit goal modal */}
      {editGoal && (
        <GoalDetailModal
          goal={editGoal}
          onClose={() => setEditGoal(null)}
          onUpdate={updateGoal}
          onDelete={deleteGoal}
        />
      )}
    </div>
  )
}

/* ─── Goal Card (minimal, clickable) ────────────────────────── */
function GoalCard({ goal, onClick, onDelete }) {
  const pct = goal.target_value > 0 ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100)) : 0
  const deadline  = goal.deadline ? new Date(goal.deadline) : null
  const daysLeft  = deadline ? Math.ceil((deadline - Date.now()) / 86400000) : null
  const deadlineColor = daysLeft !== null && daysLeft < 7 ? (daysLeft < 0 ? 'var(--danger)' : 'var(--yellow)') : 'var(--text3)'

  function handleDelete(e) {
    e.stopPropagation()
    onDelete(goal.id)
  }

  return (
    <div className="goal-card goal-card-clickable" onClick={onClick}>
      {/* Delete icon top-right */}
      <button className="goal-delete-btn" onClick={handleDelete} title="Delete goal">✕</button>

      <div className="goal-title">{goal.title}</div>

      <div className="goal-progress-track">
        <div className="goal-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="goal-values">
        <span>{goal.current_value ?? 0}</span> / {goal.target_value} {goal.unit}
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)' }}>({pct}%)</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`badge ${STATUS_COLOR[goal.status] || 'gray'}`}>{goal.status?.replace('_', ' ')}</span>
        {daysLeft !== null && (
          <span style={{ fontSize: 11, color: deadlineColor }}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
          </span>
        )}
      </div>
    </div>
  )
}

/* ─── Goal Detail Modal ──────────────────────────────────────── */
function GoalDetailModal({ goal, onClose, onUpdate, onDelete }) {
  const [title,   setTitle]   = useState(goal.title || '')
  const [target,  setTarget]  = useState(String(goal.target_value ?? ''))
  const [current, setCurrent] = useState(String(goal.current_value ?? 0))
  const [unit,    setUnit]    = useState(goal.unit || '')
  const [status,  setStatus]  = useState(goal.status || 'not_started')
  const [deadline,setDeadline]= useState(goal.deadline || '')
  const [category,setCategory]= useState(goal.category || '')
  const [notes,   setNotes]   = useState(goal.notes || '')
  const [isDirty, setIsDirty] = useState(false)

  function mark(setter) {
    return val => { setter(val); setIsDirty(true) }
  }

  async function save() {
    await onUpdate(goal.id, {
      title:         title.trim() || goal.title,
      target_value:  parseFloat(target) || null,
      current_value: parseFloat(current) || 0,
      unit:          unit.trim() || null,
      status,
      deadline:      deadline || null,
      category:      category.trim() || null,
      notes:         notes.trim() || null,
    })
    setIsDirty(false)
  }

  const pct = parseFloat(target) > 0 ? Math.min(100, Math.round((parseFloat(current) / parseFloat(target)) * 100)) : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ alignItems: 'flex-start', gap: 8 }}>
          <input
            className="task-modal-title"
            value={title}
            onChange={e => mark(setTitle)(e.target.value)}
            placeholder="Goal title..."
          />
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
            {isDirty && <button className="btn" style={{ fontSize: 11 }} onClick={save}>Save</button>}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Progress */}
          <div>
            <div className="goal-progress-track" style={{ marginBottom: 6 }}>
              <div className="goal-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="goal-values" style={{ marginBottom: 0 }}>
              <span style={{ color: 'var(--cyan)' }}>{current}</span> / {target || '?'} {unit}
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)' }}>({pct}%)</span>
            </div>
          </div>

          {/* Props */}
          <div className="task-props">
            <div className="task-prop-row">
              <span className="task-prop-label">Status</span>
              <select className="task-prop-select" value={status} onChange={e => mark(setStatus)(e.target.value)}>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="hit">Hit</option>
              </select>
            </div>
            <div className="task-prop-row">
              <span className="task-prop-label">Deadline</span>
              <input type="date" className="task-prop-select" value={deadline} onChange={e => mark(setDeadline)(e.target.value)} />
            </div>
            <div className="task-prop-row">
              <span className="task-prop-label">Category</span>
              <input className="task-prop-select" value={category} onChange={e => mark(setCategory)(e.target.value)} placeholder="e.g. analytics" />
            </div>
            <div className="task-prop-row">
              <span className="task-prop-label">Created</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtDate(goal.created_at)}</span>
            </div>
          </div>

          {/* Numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div className="detail-label">Current</div>
              <input className="input w-full" type="number" value={current} onChange={e => mark(setCurrent)(e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div>
              <div className="detail-label">Target</div>
              <input className="input w-full" type="number" value={target} onChange={e => mark(setTarget)(e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div>
              <div className="detail-label">Unit</div>
              <input className="input w-full" value={unit} onChange={e => mark(setUnit)(e.target.value)} placeholder="followers" style={{ marginTop: 4 }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="detail-label" style={{ marginBottom: 6 }}>Notes</div>
            <textarea className="task-modal-textarea" value={notes} onChange={e => mark(setNotes)(e.target.value)} rows={3} placeholder="Add notes..." />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => onDelete(goal.id)}>Delete</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {isDirty
              ? <button className="btn" style={{ fontSize: 11 }} onClick={save}>Save</button>
              : <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClose}>Close</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Reusable Goal Form (for creation) ─────────────────────── */
function GoalForm({ form, setForm }) {
  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))
  return (
    <>
      <div>
        <div className="detail-label">Title <span style={{ color: 'var(--danger)' }}>*</span></div>
        <input className="input w-full" autoFocus value={form.title} onChange={f('title')} placeholder="e.g. TikTok 50 Followers" style={{ marginTop: 6 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <div className="detail-label">Target</div>
          <input className="input w-full" type="number" value={form.target_value} onChange={f('target_value')} placeholder="50" style={{ marginTop: 6 }} />
        </div>
        <div>
          <div className="detail-label">Current</div>
          <input className="input w-full" type="number" value={form.current_value} onChange={f('current_value')} placeholder="0" style={{ marginTop: 6 }} />
        </div>
        <div>
          <div className="detail-label">Unit</div>
          <input className="input w-full" value={form.unit} onChange={f('unit')} placeholder="followers" style={{ marginTop: 6 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div className="detail-label">Status</div>
          <select className="input w-full" value={form.status} onChange={f('status')} style={{ marginTop: 6 }}>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="hit">Hit</option>
          </select>
        </div>
        <div>
          <div className="detail-label">Deadline</div>
          <input className="input w-full" type="date" value={form.deadline} onChange={f('deadline')} style={{ marginTop: 6 }} />
        </div>
      </div>
      <div>
        <div className="detail-label">Category</div>
        <input className="input w-full" value={form.category} onChange={f('category')} placeholder="e.g. analytics" style={{ marginTop: 6 }} />
      </div>
      <div>
        <div className="detail-label">Notes</div>
        <textarea className="textarea" value={form.notes} onChange={f('notes')} rows={2} style={{ marginTop: 6 }} />
      </div>
    </>
  )
}
