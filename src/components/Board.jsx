import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate } from '../lib/utils.js'

const COLUMNS = [
  { state: 'idea',        label: 'IDEA',        color: 'var(--text3)' },
  { state: 'backlog',     label: 'BACKLOG',      color: 'var(--text3)' },
  { state: 'up_next',     label: 'UP NEXT',      color: 'var(--teal)' },
  { state: 'in_progress', label: 'IN PROGRESS',  color: 'var(--cyan)' },
  { state: 'blocked',     label: 'BLOCKED',      color: '#ff4444' },
  { state: 'in_review',   label: 'IN REVIEW',    color: 'var(--yellow)' },
  { state: 'done',        label: 'DONE',         color: '#4ade80' },
]

const CAT_COLOR = {
  granny_reels: 'accent', youtube: 'teal', automation: 'purple',
  analytics: 'yellow', strategy: 'coral', admin: 'gray',
}

const PLAN_STATUS_OPTIONS = ['draft', 'submitted', 'awaiting', 'approved', 'deferred', 'on_hold']

export default function Board({ active }) {
  const [tasks,      setTasks]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [draggedId,  setDraggedId]  = useState(null)
  const [dragOver,   setDragOver]   = useState(null)
  const [blockModal, setBlockModal] = useState(null) // task being blocked
  const [blockReason, setBlockReason] = useState('')
  const [blockWaiting, setBlockWaiting] = useState('')

  useEffect(() => { if (active) loadTasks() }, [active])

  async function loadTasks() {
    setLoading(true)
    const { data, error } = await sb.from('tasks').select('*').order('created_at', { ascending: false })
    if (!error) setTasks(data || [])
    else showToast('Failed to load tasks', 'error')
    setLoading(false)
  }

  async function updateTask(id, patch) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    const { error } = await sb.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Update failed', 'error'); loadTasks() }
  }

  async function createTask(state, { title, category, priority }) {
    const { data, error } = await sb.from('tasks')
      .insert({ title, state, category, priority, created_at: new Date().toISOString() })
      .select().single()
    if (error) { showToast('Failed to create task', 'error'); return }
    setTasks(prev => [data, ...prev])
    showToast('Task created', 'success')
  }

  async function flagPlan(task) {
    await updateTask(task.id, { is_plan: true, plan_status: 'draft' })
  }

  async function markWin(task) {
    await updateTask(task.id, { is_win: true })
    try {
      await sb.from('wins').insert({ title: task.title, category: 'content', linked_task_id: task.id })
      showToast('Logged as Win', 'success')
    } catch { showToast('Win logged on task only', 'info') }
  }

  async function resolveBlock(task) {
    setBlockModal(task)
  }

  async function confirmBlock() {
    if (!blockModal) return
    await updateTask(blockModal.id, {
      state: 'blocked',
      blocking_reason: blockReason,
      waiting_on: blockWaiting,
    })
    setBlockModal(null); setBlockReason(''); setBlockWaiting('')
  }

  // Drag & drop
  function onDragStart(e, id) {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, state) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(state)
  }
  function onDrop(e, state) {
    e.preventDefault()
    if (!draggedId) return
    const task = tasks.find(t => t.id === draggedId)
    if (task && task.state !== state) {
      if (state === 'blocked') {
        setBlockModal(task)
      } else {
        updateTask(draggedId, { state })
      }
    }
    setDraggedId(null); setDragOver(null)
  }
  function onDragEnd() { setDraggedId(null); setDragOver(null) }

  const byState = (state) => tasks.filter(t => t.state === state)

  if (!active) return null

  return (
    <div className="tab-panel" style={{ paddingBottom: 0 }}>
      {loading && <div className="skeleton h-big" style={{ marginBottom: 16 }} />}
      <div className="board-wrap">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.state}
            col={col}
            tasks={byState(col.state)}
            isDragOver={dragOver === col.state}
            onDragStart={onDragStart}
            onDragOver={(e) => onDragOver(e, col.state)}
            onDrop={(e) => onDrop(e, col.state)}
            onDragEnd={onDragEnd}
            onFlagPlan={flagPlan}
            onMarkWin={markWin}
            onBlock={resolveBlock}
            onUpdateTask={updateTask}
            onCreate={(fields) => createTask(col.state, fields)}
          />
        ))}
      </div>

      {/* Block modal */}
      {blockModal && (
        <div className="modal-overlay" onClick={() => setBlockModal(null)}>
          <div className="modal-card" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Block Task</div>
              <button className="modal-close" onClick={() => setBlockModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                "{blockModal.title}"
              </div>
              <div style={{ marginBottom: 10 }}>
                <div className="detail-label">Blocking Reason</div>
                <input className="input w-full" value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="What's blocking this?" style={{ marginTop: 4 }} />
              </div>
              <div>
                <div className="detail-label">Waiting On</div>
                <input className="input w-full" value={blockWaiting} onChange={e => setBlockWaiting(e.target.value)} placeholder="Person or dependency" style={{ marginTop: 4 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setBlockModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmBlock}>Mark Blocked</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Column ─────────────────────────────────────────────────── */
function KanbanColumn({ col, tasks, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, onFlagPlan, onMarkWin, onBlock, onUpdateTask, onCreate }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm]     = useState({ title: '', category: 'admin', priority: 'medium' })

  function submitAdd(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    onCreate(form)
    setForm({ title: '', category: 'admin', priority: 'medium' })
    setAdding(false)
  }

  return (
    <div
      className={`kanban-col${isDragOver ? ' drag-over' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="col-header">
        <span className="col-name" style={{ color: col.color }}>{col.label}</span>
        <span className="col-count">{tasks.length}</span>
      </div>

      {tasks.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onFlagPlan={onFlagPlan}
          onMarkWin={onMarkWin}
          onBlock={onBlock}
          onUpdate={onUpdateTask}
        />
      ))}

      {adding ? (
        <form className="add-card-form" onSubmit={submitAdd}>
          <input
            className="input w-full"
            autoFocus
            placeholder="Task title..."
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => e.key === 'Escape' && setAdding(false)}
          />
          <select className="input w-full" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            <option value="granny_reels">Granny Reels</option>
            <option value="youtube">YouTube</option>
            <option value="automation">Automation</option>
            <option value="analytics">Analytics</option>
            <option value="strategy">Strategy</option>
            <option value="admin">Admin</option>
          </select>
          <select className="input w-full" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" type="submit" style={{ flex: 1 }}>Add</button>
            <button className="btn btn-ghost" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="add-card-btn" onClick={() => setAdding(true)}>
          <span>+</span> Add card
        </button>
      )}
    </div>
  )
}

/* ─── Task Card ──────────────────────────────────────────────── */
function TaskCard({ task, onDragStart, onDragEnd, onFlagPlan, onMarkWin, onBlock, onUpdate }) {
  const [expanded, setExpanded]       = useState(false)
  const [editNotes, setEditNotes]     = useState(false)
  const [notesVal, setNotesVal]       = useState(task.notes || '')
  const [planDropdown, setPlanDropdown] = useState(false)

  async function saveNotes() {
    await onUpdate(task.id, { notes: notesVal })
    setEditNotes(false)
    showToast('Saved', 'success')
  }

  async function setPlanStatus(status) {
    await onUpdate(task.id, { plan_status: status })
    setPlanDropdown(false)
  }

  return (
    <div
      className={`task-card${task.id === undefined ? ' dragging' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
    >
      <div className="task-title" onClick={() => setExpanded(e => !e)}>
        {task.title}
      </div>

      <div className="task-meta">
        {task.category && (
          <span className={`badge ${CAT_COLOR[task.category] || 'gray'}`}>{task.category.replace('_', ' ')}</span>
        )}
        <span className={`priority-dot ${task.priority || 'medium'}`} title={task.priority} />
        {task.is_plan && <span className="badge yellow">PLAN</span>}
        {task.is_win  && <span className="badge accent">WIN</span>}
      </div>

      <div className="task-actions">
        <button className="task-action-btn" title="Flag as Plan" onClick={() => { onFlagPlan(task); setPlanDropdown(true) }}>⚑</button>
        <button className="task-action-btn" title="Mark as Win" onClick={() => onMarkWin(task)}>🏆</button>
        <button className="task-action-btn" title="Mark Blocked" onClick={() => onBlock(task)}>⊘</button>
      </div>

      {planDropdown && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PLAN_STATUS_OPTIONS.map(s => (
            <button key={s} className="task-action-btn" style={{ fontSize: 10 }} onClick={() => setPlanStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="task-expand">
          {task.description && (
            <div className="task-expand-field">
              <div className="task-expand-label">Description</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{task.description}</div>
            </div>
          )}
          {task.blocking_reason && (
            <div className="task-expand-field">
              <div className="task-expand-label">Blocking Reason</div>
              <div style={{ fontSize: 12, color: 'var(--danger)' }}>{task.blocking_reason}</div>
            </div>
          )}
          {task.waiting_on && (
            <div className="task-expand-field">
              <div className="task-expand-label">Waiting On</div>
              <div style={{ fontSize: 12, color: 'var(--amber)' }}>{task.waiting_on}</div>
            </div>
          )}
          <div className="task-expand-field">
            <div className="task-expand-label">Notes</div>
            {editNotes ? (
              <>
                <textarea className="field-textarea" value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={3} />
                <div className="edit-actions">
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditNotes(false)}>Cancel</button>
                  <button className="btn" style={{ fontSize: 11 }} onClick={saveNotes}>Save</button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }} onClick={() => setEditNotes(true)}>
                {task.notes || <span style={{ fontStyle: 'italic' }}>Add notes…</span>}
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', marginTop: 4 }}>
            {fmtDate(task.created_at)}
          </div>
        </div>
      )}
    </div>
  )
}
