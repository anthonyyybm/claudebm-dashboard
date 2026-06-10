import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate } from '../lib/utils.js'
import { CATEGORY_OPTIONS } from '../lib/categories.js'

const PLAN_STATUS_OPTIONS = ['draft', 'submitted', 'awaiting', 'approved', 'deferred', 'on_hold']

export default function TaskModal({ task, onClose, onUpdate, onDelete }) {
  const [title,       setTitle]       = useState(task.title || '')
  const [description, setDescription] = useState(task.description || '')
  const [notes,       setNotes]       = useState(task.notes || '')
  const [category,    setCategory]    = useState(task.category || 'admin')
  const [priority,    setPriority]    = useState(task.priority || 'medium')
  const [state,       setState]       = useState(task.state || 'idea')
  const [dueDate,     setDueDate]     = useState(task.due_date || '')
  const [planStatus,  setPlanStatus]  = useState(task.plan_status || '')
  const [isDirty,     setIsDirty]     = useState(false)

  // Sync plan status from parent when it changes (e.g. after flag/unflag)
  useEffect(() => {
    setPlanStatus(task.plan_status || '')
  }, [task.plan_status, task.is_plan])

  function dirty(fn) {
    return (...args) => { fn(...args); setIsDirty(true) }
  }

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

  function confirmDelete() {
    if (window.confirm(`Delete "${task.title}"?`)) onDelete(task.id)
  }

  // Merge latest task prop into local state for read-only derived fields
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

          {/* Properties */}
          <div className="task-props">
            <span className="task-prop-label">Status</span>
            <select className="task-prop-select" value={state} onChange={e => { setState(e.target.value); setIsDirty(true) }}>
              {['idea','backlog','up_next','in_progress','blocked','in_review','done'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>

            <span className="task-prop-label">Priority</span>
            <select className="task-prop-select" value={priority} onChange={e => { setPriority(e.target.value); setIsDirty(true) }}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <span className="task-prop-label">Category</span>
            <select className="task-prop-select" value={category} onChange={e => { setCategory(e.target.value); setIsDirty(true) }}>
              {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <span className="task-prop-label">Due Date</span>
            <input
              type="date"
              className="task-prop-input"
              value={dueDate}
              onChange={e => { setDueDate(e.target.value); setIsDirty(true) }}
            />

            {isPlan && (
              <>
                <span className="task-prop-label">Plan Status</span>
                <select className="task-prop-select" value={planStatus} onChange={e => { setPlanStatus(e.target.value); setIsDirty(true) }}>
                  {PLAN_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </>
            )}

            <span className="task-prop-label">Created</span>
            <span className="task-prop-static">{fmtDate(task.created_at)}</span>

            {task.date_completed && (
              <>
                <span className="task-prop-label">Completed</span>
                <span className="task-prop-static">{fmtDate(task.date_completed)}</span>
              </>
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
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!isWin && (
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={markWin}>🏆 Win</button>
            )}
            {!isPlan
              ? <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={flagAsPlan}>⚑ Flag Plan</button>
              : <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={removePlanFlag}>✕ Remove Plan</button>
            }
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={confirmDelete}>Delete</button>
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
