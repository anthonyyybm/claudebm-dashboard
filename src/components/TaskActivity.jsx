import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtRelativeTime } from '../lib/utils.js'
import { getCommentAuthor, setCommentAuthor, logActivity } from '../lib/activity.js'

function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function TaskActivity({ taskId }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [author,  setAuthor]  = useState(getCommentAuthor())
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => { load() }, [taskId])

  async function load() {
    setLoading(true)
    const { data, error } = await sb.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
    if (!error) setItems(data || [])
    setLoading(false)
  }

  async function postComment() {
    const text = comment.trim()
    if (!text) return
    setPosting(true)
    setCommentAuthor(author)
    const { data, error } = await sb.from('task_activity')
      .insert({ task_id: taskId, type: 'comment', author: author || 'Anthony', content: text })
      .select().single()
    setPosting(false)
    if (error) { showToast('Failed to post comment', 'error'); return }
    setItems(prev => [...prev, data])
    setComment('')
  }

  return (
    <div className="task-activity">
      <div className="detail-label" style={{ marginBottom: 8 }}>Activity</div>

      {loading && <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />}

      {!loading && items.length === 0 && (
        <div className="task-activity-empty">No activity yet.</div>
      )}

      <div className="task-activity-feed">
        {items.map(item => item.type === 'comment' ? (
          <div className="task-activity-item" key={item.id}>
            <div className="task-activity-avatar">{initials(item.author)}</div>
            <div className="task-activity-body">
              <div className="task-activity-meta">
                <span className="task-activity-author">{item.author || 'Anthony'}</span>
                <span className="task-activity-time">{fmtRelativeTime(item.created_at)}</span>
              </div>
              <div className="task-activity-text">{item.content}</div>
            </div>
          </div>
        ) : (
          <div className="task-activity-log" key={item.id}>
            <span className="task-activity-log-icon">↻</span>
            <span>{item.content}</span>
            <span className="task-activity-time">· {fmtRelativeTime(item.created_at)}</span>
          </div>
        ))}
      </div>

      <div className="task-activity-composer">
        <input
          className="task-activity-author-input"
          value={author}
          onChange={e => setAuthor(e.target.value)}
          placeholder="Your name"
        />
        <textarea
          className="task-modal-textarea"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment() }}
        />
        <button className="btn" disabled={!comment.trim() || posting} onClick={postComment} style={{ alignSelf: 'flex-end' }}>
          Comment
        </button>
      </div>
    </div>
  )
}
