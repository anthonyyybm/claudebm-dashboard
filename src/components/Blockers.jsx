import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate, daysBetween } from '../lib/utils.js'
import TaskModal from './TaskModal.jsx'

export default function Blockers({ active }) {
  const [blockers,   setBlockers]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [resolving,  setResolving]  = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)

  useEffect(() => { if (active) load() }, [active])

  async function load() {
    setLoading(true)
    const { data, error } = await sb.from('tasks').select('*').eq('state', 'blocked').order('created_at', { ascending: false })
    if (!error) setBlockers(data || [])
    else showToast('Failed to load blockers', 'error')
    setLoading(false)
  }

  async function updateBlocker(id, patch) {
    setBlockers(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    setSelectedTask(prev => prev?.id === id ? { ...prev, ...patch } : prev)
    const { error } = await sb.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Update failed', 'error'); load() }
  }

  async function deleteBlocker(id) {
    setBlockers(prev => prev.filter(b => b.id !== id))
    setSelectedTask(null)
    const { error } = await sb.from('tasks').delete().eq('id', id)
    if (error) { showToast('Delete failed', 'error'); load() }
    else showToast('Deleted', 'success')
  }

  async function resolve(task) {
    setBlockers(prev => prev.filter(b => b.id !== task.id))
    await sb.from('tasks').update({ state: 'up_next', blocking_reason: null, waiting_on: null, updated_at: new Date().toISOString() }).eq('id', task.id)
    setResolving(task.id)
    showToast('Resolved — moved to Up Next', 'success')
  }

  async function logAsWin(task) {
    try {
      await sb.from('wins').insert({ title: task.title, category: 'content', linked_task_id: task.id })
      await sb.from('tasks').update({ is_win: true }).eq('id', task.id)
      showToast('Logged as Win', 'success')
    } catch { showToast('Failed to log win', 'error') }
    setResolving(null)
  }

  if (!active) return null

  return (
    <div className="tab-panel">
      <div className="page-title">Blockers</div>
      {loading && <div className="skeleton h-big" />}
      {!loading && blockers.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
          No blockers. Ship it.
        </div>
      )}
      {blockers.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table className="blockers-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Waiting On</th>
                  <th>Blocking Reason</th>
                  <th>Added</th>
                  <th>Days</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map(b => {
                  const days = daysBetween(b.created_at) ?? 0
                  return (
                    <tr key={b.id} className="blocker-row" onClick={() => setSelectedTask(b)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.waiting_on || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.blocking_reason || '—'}</td>
                      <td><span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text3)' }}>{fmtDate(b.created_at)}</span></td>
                      <td><span className="days-badge">{days}d</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        {resolving === b.id ? (
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button className="btn" style={{ fontSize: 11 }} onClick={() => logAsWin(b)}>Yes, Win</button>
                            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setResolving(null)}>No</button>
                          </span>
                        ) : (
                          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => resolve(b)}>Resolve</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateBlocker}
          onDelete={deleteBlocker}
        />
      )}
    </div>
  )
}
