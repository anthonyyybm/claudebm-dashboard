import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { secsUntilShiftEnd, formatCountdown, fmtDate, daysBetween, fmtN } from '../lib/utils.js'
import { loadAllAnalytics } from '../lib/analytics.js'

export default function Overview({ active, setActive }) {
  const style = { display: active ? 'block' : 'none' }

  return (
    <div className="tab-panel" style={style}>
      <div className="overview-cols">
        <div>
          <PulseCards />
          <QuickCapture setActive={setActive} />
          <UpcomingDeadlines setActive={setActive} />
          <RecentActivity setActive={setActive} />
        </div>
        <div>
          <ShiftTimer />
          <div style={{ marginTop: 20 }}>
            <Pomodoro />
          </div>
          <div style={{ marginTop: 20 }}>
            <SocialSnapshot />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Pulse Cards ────────────────────────────────────────────── */
function PulseCards() {
  const [stats, setStats] = useState({ goalsHit: '—', tasksDone: '—', winsLogged: '—', blockers: '—', plansAwaiting: '—' })

  useEffect(() => {
    async function load() {
      try {
        const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString()
        const [g, t, w, b, p] = await Promise.all([
          sb.from('goals').select('id', { count: 'exact', head: true }).eq('status', 'hit'),
          sb.from('tasks').select('id', { count: 'exact', head: true }).eq('state', 'done').gte('date_completed', sevenAgo),
          sb.from('wins').select('id', { count: 'exact', head: true }).gte('created_at', sevenAgo),
          sb.from('tasks').select('id', { count: 'exact', head: true }).eq('state', 'blocked'),
          sb.from('tasks').select('id', { count: 'exact', head: true }).eq('is_plan', true).in('plan_status', ['submitted', 'awaiting']),
        ])
        setStats({
          goalsHit:     g.count ?? 0,
          tasksDone:    t.count ?? 0,
          winsLogged:   w.count ?? 0,
          blockers:     b.count ?? 0,
          plansAwaiting: p.count ?? 0,
        })
      } catch (e) {
        showToast('Failed to load pulse stats', 'error')
      }
    }
    load()
  }, [])

  const cards = [
    { num: stats.goalsHit,      label: 'Goals Hit' },
    { num: stats.tasksDone,     label: 'Tasks Done' },
    { num: stats.winsLogged,    label: 'Wins Logged' },
    { num: stats.blockers,      label: 'Blockers' },
    { num: stats.plansAwaiting, label: 'Plans Awaiting' },
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title">Weekly Pulse</div>
      <div className="pulse-grid">
        {cards.map(c => (
          <div key={c.label} className="pulse-card">
            <div className="pulse-num">{c.num}</div>
            <div className="pulse-label">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Quick Capture ──────────────────────────────────────────── */
function QuickCapture({ setActive }) {
  const [value, setValue]       = useState('')
  const [captures, setCaptures] = useState([])
  const [flash, setFlash]       = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    loadCaptures()
    // expose focus fn for global C key
    window._focusCapture = () => inputRef.current?.focus()
    return () => { delete window._focusCapture }
  }, [])

  async function loadCaptures() {
    const { data } = await sb.from('quick_captures')
      .select('*')
      .is('promoted_to_task_id', null)
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setCaptures(data)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    setValue('')
    setFlash(true)
    setTimeout(() => setFlash(false), 500)
    try {
      const { data, error } = await sb.from('quick_captures').insert({ content: text }).select().single()
      if (error) throw error
      setCaptures(prev => [data, ...prev].slice(0, 5))
    } catch {
      showToast('Failed to save capture', 'error')
    }
  }

  async function makeTask(capture) {
    try {
      const { data: task, error: te } = await sb.from('tasks')
        .insert({ title: capture.content, state: 'idea', category: 'admin', priority: 'medium' })
        .select().single()
      if (te) throw te
      await sb.from('quick_captures').update({ promoted_to_task_id: task.id }).eq('id', capture.id)
      setCaptures(prev => prev.filter(c => c.id !== capture.id))
      showToast('Created task from capture', 'success')
      setActive('board')
    } catch {
      showToast('Failed to create task', 'error')
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title">Quick Capture</div>
      <form onSubmit={handleSubmit} className="capture-wrap">
        <input
          id="quick-capture-input"
          ref={inputRef}
          className={`capture-input${flash ? ' flash' : ''}`}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Capture a thought..."
          autoComplete="off"
        />
        <div className="capture-hint">Press C from anywhere to focus</div>
      </form>
      {captures.length > 0 && (
        <div className="capture-list">
          {captures.map(c => (
            <div key={c.id} className="capture-item">
              <span className="capture-item-text">{c.content}</span>
              <button className="make-task-btn" onClick={() => makeTask(c)}>→ Make Task</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Shift Timer ────────────────────────────────────────────── */
function ShiftTimer() {
  const [secs,       setSecs]       = useState(secsUntilShiftEnd())
  const [shiftState, setShiftState] = useState('idle') // 'idle' | 'running' | 'paused'
  const [elapsed,    setElapsed]    = useState(0)
  const elapsedRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setSecs(secsUntilShiftEnd()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (shiftState === 'running') {
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(elapsedRef.current)
    }
    return () => clearInterval(elapsedRef.current)
  }, [shiftState])

  function startShift()  { setShiftState('running'); setElapsed(0) }
  function resumeShift() { setShiftState('running') }
  function pauseShift()  { setShiftState('paused') }
  function endShift()    { setShiftState('idle');   setElapsed(0) }

  const cls = secs < 900 ? 'shift-big alert' : secs < 3600 ? 'shift-big warn' : 'shift-big'

  return (
    <div className="card">
      <div className="shift-big-label">SHIFT ENDS</div>

      {/* Countdown only visible once shift has started */}
      {shiftState === 'idle'
        ? <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--text3)', letterSpacing: 2, margin: '4px 0' }}>—</div>
        : <div className={cls}>{formatCountdown(secs)}</div>
      }
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>5:00 AM PHT</div>

      {shiftState !== 'idle' && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(0,254,250,0.06)', borderRadius: 6, border: '1px solid rgba(0,254,250,0.15)' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
            {shiftState === 'running' ? 'Shift active — elapsed' : 'Shift paused'}
          </div>
          <div style={{ fontWeight: 600, fontSize: 22, color: shiftState === 'paused' ? 'var(--text3)' : 'var(--cyan)' }}>
            {formatCountdown(elapsed)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        {shiftState === 'idle' && (
          <button className="btn" style={{ flex: 1, fontSize: 11 }} onClick={startShift}>▶ Start Shift</button>
        )}
        {shiftState === 'running' && (
          <>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={pauseShift}>⏸ Pause</button>
            <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={endShift}>■ End</button>
          </>
        )}
        {shiftState === 'paused' && (
          <>
            <button className="btn" style={{ flex: 1, fontSize: 11 }} onClick={resumeShift}>▶ Resume</button>
            <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={endShift}>■ End</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Pomodoro ───────────────────────────────────────────────── */
const WORK_SECS  = 25 * 60
const BREAK_SECS = 5 * 60

function Pomodoro() {
  const [secs,     setSecs]     = useState(WORK_SECS)
  const [running,  setRunning]  = useState(false)
  const [isBreak,  setIsBreak]  = useState(false)
  const [sessions, setSessions] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setSecs(s => {
          if (s <= 1) {
            clearInterval(timerRef.current)
            setRunning(false)
            if (!isBreak) {
              setSessions(n => Math.min(n + 1, 4))
              setIsBreak(true)
              setSecs(BREAK_SECS)
            } else {
              setIsBreak(false)
              setSecs(WORK_SECS)
            }
            return 0
          }
          return s - 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [running, isBreak])

  function reset() {
    clearInterval(timerRef.current)
    setRunning(false)
    setIsBreak(false)
    setSecs(WORK_SECS)
    setSessions(0)
  }

  return (
    <div className="card">
      <div className="pomo-wrap">
        <div>
          <div className="pomo-label">{isBreak ? 'BREAK' : 'FOCUS'}</div>
          <div className={`pomo-display${isBreak ? ' break' : ''}`}>
            {formatCountdown(secs)}
          </div>
        </div>
        <div className="pomo-btns">
          <button className="pomo-btn" onClick={() => setRunning(r => !r)}>
            {running ? 'Pause' : 'Start'}
          </button>
          <button className="pomo-btn" onClick={reset}>Reset</button>
        </div>
        <div className="pomo-dots">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`pomo-dot${i < sessions ? ' done' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Upcoming Deadlines ─────────────────────────────────────── */
function UpcomingDeadlines({ setActive }) {
  const [goals, setGoals] = useState([])

  useEffect(() => {
    async function load() {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() + 14)
      const { data } = await sb.from('goals')
        .select('id,title,deadline,status')
        .neq('status', 'hit')
        .not('deadline', 'is', null)
        .lte('deadline', cutoff.toISOString().slice(0, 10))
        .order('deadline', { ascending: true })
        .limit(5)
      if (data) setGoals(data)
    }
    load()
  }, [])

  if (goals.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title">Upcoming Deadlines</div>
      <div className="card" style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {goals.map(g => {
            const daysAgo  = daysBetween(g.deadline)
            const daysLeft = daysAgo !== null ? -daysAgo : null
            const overdue  = daysLeft !== null && daysLeft < 0
            const urgent   = daysLeft !== null && daysLeft <= 3 && !overdue
            const color    = overdue ? 'var(--danger)' : urgent ? 'var(--yellow)' : 'var(--text3)'
            const label    = overdue ? `${Math.abs(daysLeft)}d overdue`
              : daysLeft === 0 ? 'Today'
              : daysLeft === 1 ? 'Tomorrow'
              : `${daysLeft}d left`
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: 'nowrap' }}>{label}</span>
              </div>
            )
          })}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 12, width: '100%' }} onClick={() => setActive('goals')}>
          View all goals →
        </button>
      </div>
    </div>
  )
}

/* ─── Recent Activity ────────────────────────────────────────── */
function RecentActivity() {
  const [items, setItems] = useState([])

  useEffect(() => {
    async function load() {
      const [{ data: tasks }, { data: scripts }] = await Promise.all([
        sb.from('tasks').select('id,title,state,updated_at').order('updated_at', { ascending: false }).limit(4),
        sb.from('scripts').select('id,topic,status,created_at').eq('is_archived', false).order('created_at', { ascending: false }).limit(3),
      ])
      const merged = [
        ...(tasks || []).map(t => ({ id: 'task-' + t.id, label: t.title, meta: t.state.replace(/_/g, ' '), time: t.updated_at, type: 'task' })),
        ...(scripts || []).map(s => ({ id: 'scr-' + s.id, label: s.topic || 'Untitled script', meta: s.status, time: s.created_at, type: 'script' })),
      ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6)
      setItems(merged)
    }
    load()
  }, [])

  if (items.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title">Recent Activity</div>
      <div className="card" style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 9, color: item.type === 'task' ? 'var(--teal)' : 'var(--cyan)', flexShrink: 0 }}>
                {item.type === 'task' ? '◆' : '▶'}
              </span>
              <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
              <span style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{item.meta}</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', minWidth: 58, textAlign: 'right' }}>{fmtDate(item.time)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Social Snapshot ────────────────────────────────────────── */
function SocialSnapshot() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAllAnalytics().then(d => { setData(d); setLoading(false) })
  }, [])

  const rows = [
    { name: 'TikTok',    abbr: 'TT', color: '#00C2A8', followers: data?.tiktok?.followers,    avg: data?.tiktok?.avg_views,   ok: data?.tiktok?.success },
    { name: 'YouTube',   abbr: 'YT', color: '#FF0000', followers: data?.youtube?.subscribers, avg: data?.youtube?.avg_views,  ok: data?.youtube?.success },
    { name: 'Instagram', abbr: 'IG', color: '#E1306C', followers: null,                       avg: null,                      ok: false },
  ]

  return (
    <div className="card">
      <div className="card-title">Social Snapshot</div>
      {loading
        ? <div className="skeleton" style={{ height: 70 }} />
        : rows.map(r => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 22, height: 22, borderRadius: 5, background: r.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{r.abbr}</span>
            <span style={{ flex: 1, fontSize: 12 }}>{r.name}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', minWidth: 44, textAlign: 'right' }}>{r.followers != null ? fmtN(r.followers) : '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 52, textAlign: 'right' }}>{r.avg != null ? fmtN(r.avg) + ' avg' : '—'}</span>
          </div>
        ))
      }
    </div>
  )
}
