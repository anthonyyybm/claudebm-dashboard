import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import TaskModal from './TaskModal.jsx'
import { CATEGORY_OPTIONS, CAT_COLOR } from '../lib/categories.js'
import { STATUS_OPTIONS, statusMeta } from '../lib/taskMeta.js'
import { logActivity, getCommentAuthor } from '../lib/activity.js'

const COLUMNS = STATUS_OPTIONS.map(s => ({ state: s.value, label: s.label.toUpperCase(), color: s.color }))

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const CAT_OPTIONS = ['all', ...CATEGORY_OPTIONS.map(c => c.value)]

export default function Board({ active }) {
  const [tasks,       setTasks]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [draggedId,   setDraggedId]   = useState(null)
  const [dragOver,    setDragOver]    = useState(null)
  const [blockModal,  setBlockModal]  = useState(null)
  const [blockReason, setBlockReason] = useState('')
  const [blockWaiting,setBlockWaiting]= useState('')
  const [addModal,    setAddModal]    = useState(null)
  const [addForm,     setAddForm]     = useState({ title: '', category: 'admin', priority: 'medium', description: '' })
  const [selectedTask,setSelectedTask]= useState(null)
  const [sortBy,      setSortBy]      = useState('created')
  const [filterCat,   setFilterCat]   = useState('all')
  const [filterPeriod,setFilterPeriod]= useState('all')
  const [search,      setSearch]      = useState('')

  useEffect(() => { if (active) loadTasks() }, [active])

  async function loadTasks() {
    setLoading(true)
    const { data, error } = await sb.from('tasks').select('*').order('created_at', { ascending: false })
    if (!error) setTasks(data || [])
    else showToast('Failed to load tasks', 'error')
    setLoading(false)
  }

  async function updateTask(id, patch) {
    const prevTask = tasks.find(t => t.id === id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    setSelectedTask(prev => prev?.id === id ? { ...prev, ...patch } : prev)
    const { error } = await sb.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Update failed', 'error'); loadTasks(); return }
    if (patch.state && prevTask && patch.state !== prevTask.state) {
      const from = statusMeta(prevTask.state).label
      const to = statusMeta(patch.state).label
      logActivity(id, { type: 'log', content: `Status changed from ${from} to ${to}`, author: getCommentAuthor() })
    }
  }

  async function createTask(state, form) {
    const { data, error } = await sb.from('tasks')
      .insert({ title: form.title, state, category: form.category, priority: form.priority, description: form.description || null, created_at: new Date().toISOString() })
      .select().single()
    if (error) { showToast('Failed to create task', 'error'); return }
    setTasks(prev => [data, ...prev])
    showToast('Task created', 'success')
  }

  async function duplicateTask(task) {
    const { data, error } = await sb.from('tasks')
      .insert({
        title: `${task.title} (copy)`,
        state: 'idea',
        category: task.category,
        priority: task.priority,
        description: task.description || null,
        created_at: new Date().toISOString(),
      })
      .select().single()
    if (error) { showToast('Failed to duplicate task', 'error'); return }
    setTasks(prev => [data, ...prev])
    showToast('Task duplicated', 'success')
  }

  async function deleteTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setSelectedTask(null)
    const { error } = await sb.from('tasks').delete().eq('id', id)
    if (error) { showToast('Delete failed', 'error'); loadTasks() }
    else showToast('Task deleted', 'success')
  }

  async function confirmBlock() {
    if (!blockModal) return
    await updateTask(blockModal.id, { state: 'blocked', blocking_reason: blockReason, waiting_on: blockWaiting })
    setBlockModal(null); setBlockReason(''); setBlockWaiting('')
  }

  // Drag & drop
  function onDragStart(e, id) { setDraggedId(id); e.dataTransfer.effectAllowed = 'move' }
  function onDragOver(e, state) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(state) }
  function onDrop(e, state) {
    e.preventDefault()
    if (!draggedId) return
    const task = tasks.find(t => t.id === draggedId)
    if (task && task.state !== state) {
      if (state === 'blocked') { setBlockModal(task) }
      else { updateTask(draggedId, { state }) }
    }
    setDraggedId(null); setDragOver(null)
  }
  function onDragEnd() { setDraggedId(null); setDragOver(null) }

  // Filter + sort
  const filteredTasks = useMemo(() => {
    let list = tasks
    if (filterCat !== 'all') list = list.filter(t => t.category === filterCat)
    if (filterPeriod === 'week') {
      const cutoff = Date.now() - 7 * 86400000
      list = list.filter(t => new Date(t.created_at).getTime() >= cutoff)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => (t.title || '').toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sortBy === 'priority') sorted.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
    else if (sortBy === 'title') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return sorted
  }, [tasks, filterCat, filterPeriod, search, sortBy])

  const byState = (state) => filteredTasks.filter(t => t.state === state)

  if (!active) return null

  return (
    <div className="tab-panel board-panel">

      {/* Controls */}
      <div className="board-controls">
        <div className="filter-bar" style={{ margin: 0, flex: 1, flexWrap: 'wrap' }}>
          {CAT_OPTIONS.map(c => (
            <button key={c} className={`filter-btn${filterCat === c ? ' active' : ''}`} onClick={() => setFilterCat(c)}>
              {c === 'all' ? 'All' : c.replace(/_/g, ' ')}
            </button>
          ))}
          <button className={`filter-btn${filterPeriod === 'week' ? ' active' : ''}`} onClick={() => setFilterPeriod(p => p === 'week' ? 'all' : 'week')}>
            This Week
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            className="input"
            style={{ fontSize: 11, padding: '4px 10px', width: 140 }}
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Sort</span>
          {[['created','Date'],['priority','Priority'],['title','Title']].map(([k,l]) => (
            <button key={k} className={`filter-btn${sortBy === k ? ' active' : ''}`} onClick={() => setSortBy(k)}>{l}</button>
          ))}
        </div>
      </div>

      {loading && <div className="skeleton h-big" style={{ marginBottom: 12 }} />}

      <div className="board-wrap">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.state}
            col={col}
            tasks={byState(col.state)}
            draggedId={draggedId}
            isDragOver={dragOver === col.state}
            onDragStart={onDragStart}
            onDragOver={e => onDragOver(e, col.state)}
            onDrop={e => onDrop(e, col.state)}
            onDragEnd={onDragEnd}
            onOpenTask={setSelectedTask}
            onAddCard={() => { setAddForm({ title: '', category: 'admin', priority: 'medium', description: '' }); setAddModal({ state: col.state }) }}
          />
        ))}
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onDuplicate={duplicateTask}
        />
      )}

      {/* Add card modal */}
      {addModal && (
        <div className="modal-overlay" onClick={() => setAddModal(null)}>
          <div className="modal-card" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">New Task — <span style={{ color: 'var(--cyan)', textTransform: 'uppercase', fontSize: 13 }}>{addModal.state.replace(/_/g, ' ')}</span></div>
              <button className="modal-close" onClick={() => setAddModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div>
                <div className="detail-label">Title <span style={{ color: 'var(--danger)' }}>*</span></div>
                <input className="input w-full" autoFocus value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="What needs to be done?" style={{ marginTop: 6 }}
                  onKeyDown={e => { if (e.key === 'Enter' && addForm.title.trim()) { createTask(addModal.state, addForm); setAddModal(null) } }}
                />
              </div>
              <div>
                <div className="detail-label">Description</div>
                <textarea className="textarea" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional details…" rows={3} style={{ marginTop: 6 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="detail-label">Category</div>
                  <select className="input w-full" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ marginTop: 6 }}>
                    {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="detail-label">Priority</div>
                  <select className="input w-full" value={addForm.priority} onChange={e => setAddForm(f => ({ ...f, priority: e.target.value }))} style={{ marginTop: 6 }}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setAddModal(null)}>Cancel</button>
              <button className="btn" disabled={!addForm.title.trim()} onClick={() => { createTask(addModal.state, addForm); setAddModal(null) }}>
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block modal */}
      {blockModal && (
        <div className="modal-overlay" onClick={() => setBlockModal(null)}>
          <div className="modal-card" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Block Task</div>
              <button className="modal-close" onClick={() => setBlockModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>"{blockModal.title}"</div>
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
function KanbanColumn({ col, tasks, draggedId, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, onOpenTask, onAddCard }) {
  return (
    <div className={`kanban-col${isDragOver ? ' drag-over' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="col-header">
        <span className="col-name" style={{ color: col.color }}>{col.label}</span>
        <span className="col-count">{tasks.length}</span>
      </div>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} isDragging={draggedId === task.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onOpen={onOpenTask} />
      ))}
      <button className="add-card-btn" onClick={onAddCard}><span>+</span> Add card</button>
    </div>
  )
}

/* ─── Task Card ──────────────────────────────────────────────── */
function TaskCard({ task, isDragging, onDragStart, onDragEnd, onOpen }) {
  return (
    <div
      className={`task-card${isDragging ? ' dragging' : ''}`}
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(e, task.id) }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
    >
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        {task.category && <span className={`badge ${CAT_COLOR[task.category] || 'gray'}`}>{task.category.replace(/_/g, ' ')}</span>}
        <span className={`priority-dot ${task.priority || 'medium'}`} title={task.priority} />
        {task.is_plan && <span className="badge yellow">PLAN</span>}
        {task.is_win  && <span className="badge accent">WIN</span>}
      </div>
      {task.description && (
        <div className="task-card-desc">{task.description}</div>
      )}
    </div>
  )
}
