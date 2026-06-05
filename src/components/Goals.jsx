import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate } from '../lib/utils.js'

const STATUS_COLOR = { not_started: 'gray', in_progress: 'accent', hit: 'green' }

export default function Goals({ active }) {
  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)

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

  if (!active) return null

  return (
    <div className="tab-panel">
      <div className="flex-between mb-12">
        <div className="page-title" style={{ marginBottom: 0 }}>Goals</div>
      </div>
      {loading
        ? <div className="goals-grid">{[1,2,3].map(i => <div key={i} className="skeleton h-big" style={{ borderRadius: 8, height: 160 }} />)}</div>
        : <div className="goals-grid">
            {goals.map(g => <GoalCard key={g.id} goal={g} onUpdate={updateGoal} />)}
          </div>
      }
    </div>
  )
}

function GoalCard({ goal, onUpdate }) {
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
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: deadlineColor }}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
          </span>
        )}
      </div>

      {!editing ? (
        <button className="btn btn-ghost" style={{ fontSize: 11, width: '100%' }} onClick={() => setEditing(true)}>
          Edit
        </button>
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
