import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { secsUntilShiftEnd, formatCountdown } from '../lib/utils.js'

export default function Overview({ active, setActive }) {
  const style = { display: active ? 'block' : 'none' }

  return (
    <div className="tab-panel" style={style}>
      <div className="overview-cols">
        <div>
          <PulseCards />
          <QuickCapture setActive={setActive} />
        </div>
        <div>
          <ShiftTimer />
          <div style={{ marginTop: 20 }}>
            <Pomodoro />
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
  const [secs, setSecs] = useState(secsUntilShiftEnd())

  useEffect(() => {
    const id = setInterval(() => setSecs(secsUntilShiftEnd()), 1000)
    return () => clearInterval(id)
  }, [])

  const cls = secs < 900 ? 'shift-big alert' : secs < 3600 ? 'shift-big warn' : 'shift-big'

  return (
    <div className="card">
      <div className="shift-big-label">SHIFT ENDS</div>
      <div className={cls}>{formatCountdown(secs)}</div>
      <div style={{ marginTop: 6, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text3)' }}>
        5:00 AM PHT
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
