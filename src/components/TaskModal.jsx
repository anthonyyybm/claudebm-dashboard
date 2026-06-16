import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import { fmtDate } from '../lib/utils.js'
import { CATEGORY_OPTIONS, CAT_COLOR, BADGE_COLOR_VALUE } from '../lib/categories.js'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, statusMeta } from '../lib/taskMeta.js'
import TaskActivity from './TaskActivity.jsx'
import PropChipSelect from './PropChipSelect.jsx'

const PLAN_STATUS_OPTIONS = ['draft', 'submitted', 'awaiting', 'approved', 'deferred', 'on_hold']
const PLAN_STATUS_CHIP_OPTIONS = PLAN_STATUS_OPTIONS.map(s => ({ value: s, label: s.replace('_', ' ') }))

export default function TaskModal({ task, allTasks = [], onClose, onUpdate, onDelete, onDuplicate, onSelectTask, onAddSubtask, onLinkSubtask, onUnlinkSubtask }) {
  const [title,       setTitle]       = useState(task.title || '')
  const [description, setDescription] = useState(task.description || '')
  const [notes,       setNotes]       = useState(task.notes || '')
  const [category,    setCategory]    = useState(task.category || 'admin')
  const [priority,    setPriority]    = useState(task.priority || 'medium')
  const [state,       setState]       = useState(task.state || 'idea')
  const [dueDate,     setDueDate]     = useState(task.due_date || '')
  const [planStatus,  setPlanStatus]  = useState(task.plan_status || '')
  const [isDirty,     setIsDirty]     = useState(false)
  const [newSubtask,  setNewSubtask]  = useState('')
  const [linkTaskId,  setLinkTaskId]  = useState('')

  const parentTask = task.parent_task_id ? allTasks.find(t => t.id === task.parent_task_id) : null
  const subtasks = allTasks.filter(t => t.parent_task_id === task.id)
  const linkableTasks = allTasks.filter(t =>
    t.id !== task.id && t.id !== task.parent_task_id && !t.parent_task_id
  )

  // Sync plan status from parent when it changes (e.g. after flag/unflag)
  useEffect(() => {
    setPlanStatus(task.plan_status || '')
  }, [task.plan_status, task.is_plan])

  async function saveAll() {
    const patch = {
      title:       title.trim() || task.title,
      description: description || null,
      notes:       notes || null,
      category,
      priority,
      state,
      due_date:    dueDate || null,
      plan_status: planStatus || null,
    }
    if (!planStatus && task.is_plan) patch.is_plan = false
    await onUpdate(task.id, patch)
    setIsDirty(false)
    showToast('Saved', 'success')
  }

  async function removePlanFlag() {
    await onUpdate(task.id, { is_plan: false, plan_status: null })
    showToast('Plan flag removed', 'success')
  }

  async function flagAsPlan() {
    await onUpdate(task.id, { is_plan: true, plan_status: 'draft' })
    showToast('Flagged as plan', 'success')
  }

  async function markWin() {
    await onUpdate(task.id, { is_win: true })
    try {
      await sb.from('wins').insert({ title: task.title, category: 'content', linked_task_id: task.id })
      showToast('Logged as Win', 'success')
    } catch { showToast('Win logged on task only', 'info') }
  }

  async function confirmDelete() {
    if (await confirmDialog(`Delete "${task.title}"?`, { danger: true, confirmLabel: 'Delete' })) onDelete(task.id)
  }

  function duplicate() {
    onDuplicate(task)
  }

  async function addSubtask() {
    const title = newSubtask.trim()
    if (!title) return
    await onAddSubtask(task.id, title)
    setNewSubtask('')
  }

  function linkExisting(e) {
    const id = e.target.value
    if (id) onLinkSubtask(id, task.id)
    setLinkTaskId('')
  }

  const isPlan = task.is_plan
  const isWin  = task.is_win
  const isBlocked = task.state === 'blocked' || state === 'blocked'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card task-detail-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="modal-header task-modal-header" style={{ alignItems: 'flex-start', gap: 8 }}>
          <input
            className="task-modal-title"
            value={title}
            onChange={e => { setTitle(e.target.value); setIsDirty(true) }}
            placeholder="Task title..."
          />
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
            {isDirty && (
              <button className="btn" style={{ fontSize: 11, padding: '4px 12px' }} onClick={saveAll}>Save</button>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="modal-body" style={{ gap: 0 }}>

          {/* Main grid: content + operations rail */}
          <div className="task-modal-grid">
            <div className="task-modal-main">

              {/* Property list */}
              <div className="task-prop-list">
                <div className="task-prop-row">
                  <span className="task-prop-row-label">◉ Status</span>
                  <PropChipSelect
                    value={state}
                    options={STATUS_OPTIONS}
                    onChange={v => { setState(v); setIsDirty(true) }}
                  />
                </div>

                <div className="task-prop-row">
                  <span className="task-prop-row-label">⚑ Priority</span>
                  <PropChipSelect
                    value={priority}
                    options={PRIORITY_OPTIONS}
                    onChange={v => { setPriority(v); setIsDirty(true) }}
                  />
                </div>

                <div className="task-prop-row">
                  <span className="task-prop-row-label">🏷 Category</span>
                  <PropChipSelect
                    value={category}
                    options={CATEGORY_OPTIONS}
                    colorOf={c => BADGE_COLOR_VALUE[CAT_COLOR[c.value]] || 'var(--text3)'}
                    onChange={v => { setCategory(v); setIsDirty(true) }}
                  />
                </div>

                <div className="task-prop-row">
                  <span className="task-prop-row-label">📅 Due Date</span>
                  <div className="task-prop-chip task-prop-chip-date">
                    <input
                      type="date"
                      className="task-prop-chip-date-input"
                      value={dueDate}
                      onChange={e => { setDueDate(e.target.value); setIsDirty(true) }}
                    />
                  </div>
                </div>

                {isPlan && (
                  <div className="task-prop-row">
                    <span className="task-prop-row-label">📋 Plan Status</span>
                    <PropChipSelect
                      value={planStatus}
                      options={PLAN_STATUS_CHIP_OPTIONS}
                      colorOf={() => 'var(--yellow)'}
                      onChange={v => { setPlanStatus(v); setIsDirty(true) }}
                    />
                  </div>
                )}

                <div className="task-prop-row">
                  <span className="task-prop-row-label">🕐 Created</span>
                  <span className="task-prop-static">{fmtDate(task.created_at)}</span>
                </div>

                {task.date_completed && (
                  <div className="task-prop-row">
                    <span className="task-prop-row-label">✅ Completed</span>
                    <span className="task-prop-static">{fmtDate(task.date_completed)}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {(isPlan || isWin || isBlocked) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  {isPlan    && <span className="badge yellow">PLAN {planStatus && `· ${planStatus.replace('_',' ')}`}</span>}
                  {isWin     && <span className="badge accent">WIN</span>}
                  {isBlocked && <span className="badge red">BLOCKED</span>}
                </div>
              )}

              {/* Block details */}
              {(task.blocking_reason || task.waiting_on) && (
                <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 6, padding: '10px 14px', margin: '12px 0' }}>
                  {task.blocking_reason && (
                    <div style={{ marginBottom: task.waiting_on ? 8 : 0 }}>
                      <div className="detail-label" style={{ color: 'var(--danger)' }}>Blocking Reason</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{task.blocking_reason}</div>
                    </div>
                  )}
                  {task.waiting_on && (
                    <div>
                      <div className="detail-label" style={{ color: 'var(--amber)' }}>Waiting On</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{task.waiting_on}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="task-modal-section">
                <div className="detail-label" style={{ marginBottom: 6 }}>Description</div>
                <textarea
                  className="task-modal-textarea"
                  value={description}
                  onChange={e => { setDescription(e.target.value); setIsDirty(true) }}
                  placeholder="Add a description..."
                  rows={3}
                />
              </div>

              {/* Notes */}
              <div className="task-modal-section">
                <div className="detail-label" style={{ marginBottom: 6 }}>Notes</div>
                <textarea
                  className="task-modal-textarea"
                  value={notes}
                  onChange={e => { setNotes(e.target.value); setIsDirty(true) }}
                  placeholder="Add notes..."
                  rows={3}
                />
              </div>

              {/* Parent task */}
              {parentTask && (
                <div className="task-modal-section">
                  <div className="detail-label" style={{ marginBottom: 6 }}>Parent Task</div>
                  <div className="subtask-row">
                    <span className="priority-dot" style={{ background: statusMeta(parentTask.state).color }} />
                    <span className="subtask-title" onClick={() => onSelectTask(parentTask)}>{parentTask.title}</span>
                    <span className="badge gray">{statusMeta(parentTask.state).label}</span>
                    <button className="task-activity-action danger" onClick={() => onUnlinkSubtask(task.id)}>Unlink</button>
                  </div>
                </div>
              )}

              {/* Subtasks */}
              <div className="task-modal-section">
                <div className="detail-label" style={{ marginBottom: 6 }}>
                  Subtasks{subtasks.length > 0 && ` (${subtasks.filter(s => s.state === 'done').length}/${subtasks.length})`}
                </div>

                {subtasks.length === 0 && <div className="task-activity-empty">No subtasks yet.</div>}

                {subtasks.map(st => (
                  <div className="subtask-row" key={st.id}>
                    <span className="priority-dot" style={{ background: statusMeta(st.state).color }} />
                    <span className="subtask-title" onClick={() => onSelectTask(st)}>{st.title}</span>
                    <span className="badge gray">{statusMeta(st.state).label}</span>
                    <button className="task-activity-action danger" onClick={() => onUnlinkSubtask(st.id)}>Unlink</button>
                  </div>
                ))}

                <div className="subtask-add">
                  <input
                    className="input"
                    value={newSubtask}
                    onChange={e => setNewSubtask(e.target.value)}
                    placeholder="Add subtask..."
                    onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) addSubtask() }}
                  />
                  <button className="btn" disabled={!newSubtask.trim()} onClick={addSubtask}>+ Add</button>
                </div>

                {linkableTasks.length > 0 && (
                  <select className="input w-full" style={{ marginTop: 8 }} value={linkTaskId} onChange={linkExisting}>
                    <option value="">Link existing task as subtask...</option>
                    {linkableTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                )}
              </div>

              {/* Activity */}
              <TaskActivity taskId={task.id} />
            </div>

            <div className="task-ops-rail">
              <div className="task-ops-rail-label">Operations</div>
              {!isWin && (
                <button className="task-ops-btn" onClick={markWin}>🏆 Mark as Win</button>
              )}
              {!isPlan
                ? <button className="task-ops-btn" onClick={flagAsPlan}>⚑ Flag as Plan</button>
                : <button className="task-ops-btn" onClick={removePlanFlag}>✕ Remove Plan Flag</button>
              }
              <button className="task-ops-btn" onClick={duplicate}>⧉ Duplicate Task</button>
              <button className="task-ops-btn danger" onClick={confirmDelete}>🗑 Delete Task</button>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          <div />
          <div style={{ display: 'flex', gap: 6 }}>
            {isDirty
              ? <button className="btn" style={{ fontSize: 11 }} onClick={saveAll}>Save</button>
              : <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClose}>Close</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
