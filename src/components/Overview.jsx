import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate, daysBetween, fmtN, phtNow, formatCountdown } from '../lib/utils.js'
import { loadAllAnalytics } from '../lib/analytics.js'

const SHIFT_KEY     = 'bm_shift'
const WORKDAYS_KEY  = 'bm_work_days'
const SHIFT_SECS    = 5 * 3600

export default function Overview({ active, setActive }) {
  const style = { display: active ? 'block' : 'none' }
  return (
    <div className="tab-panel" style={style}>
      <div className="overview-cols">
        <div>
          <PulseCards />
          <QuickCapture setActive={setActive} />
          <WeeklySummary />
          <UpcomingDeadlines setActive={setActive} />
          <RecentActivity setActive={setActive} />
        </div>
        <div>
          <ShiftTimer />
          <div style={{ marginTop: 20 }}><Pomodoro /></div>
          <div style={{ marginTop: 20 }}><SocialSnapshot /></div>
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
        setStats({ goalsHit: g.count ?? 0, tasksDone: t.count ?? 0, winsLogged: w.count ?? 0, blockers: b.count ?? 0, plansAwaiting: p.count ?? 0 })
      } catch { showToast('Failed to load pulse stats', 'error') }
    }
    load()
  }, [])

  const cards = [
    { num: stats.goalsHit,       label: 'Goals Hit' },
    { num: stats.tasksDone,      label: 'Tasks Done' },
    { num: stats.winsLogged,     label: 'Wins Logged' },
    { num: stats.blockers,       label: 'Blockers' },
    { num: stats.plansAwaiting,  label: 'Plans Awaiting' },
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
  const [value,    setValue]    = useState('')
  const [captures, setCaptures] = useState([])
  const [flash,    setFlash]    = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    loadCaptures()
    window._focusCapture = () => inputRef.current?.focus()
    return () => { delete window._focusCapture }
  }, [])

  async function loadCaptures() {
    const { data } = await sb.from('quick_captures').select('*').is('promoted_to_task_id', null).order('created_at', { ascending: false }).limit(5)
    if (data) setCaptures(data)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const text = value.trim(); if (!text) return
    setValue(''); setFlash(true); setTimeout(() => setFlash(false), 500)
    try {
      const { data, error } = await sb.from('quick_captures').insert({ content: text }).select().single()
      if (error) throw error
      setCaptures(prev => [data, ...prev].slice(0, 5))
    } catch { showToast('Failed to save capture', 'error') }
  }

  async function makeTask(capture) {
    try {
      const { data: task, error: te } = await sb.from('tasks').insert({ title: capture.content, state: 'idea', category: 'admin', priority: 'medium' }).select().single()
      if (te) throw te
      await sb.from('quick_captures').update({ promoted_to_task_id: task.id }).eq('id', capture.id)
      setCaptures(prev => prev.filter(c => c.id !== capture.id))
      showToast('Created task from capture', 'success')
      setActive('board')
    } catch { showToast('Failed to create task', 'error') }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title">Quick Capture</div>
      <form onSubmit={handleSubmit} className="capture-wrap">
        <input id="quick-capture-input" ref={inputRef} className={`capture-input${flash ? ' flash' : ''}`}
          value={value} onChange={e => setValue(e.target.value)} placeholder="Capture a thought..." autoComplete="off" />
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

/* ─── Weekly Summary (prominent on Tuesdays) ─────────────────── */
function WeeklySummary() {
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(false)
  const pht        = phtNow()
  const isTuesday  = pht.getDay() === 2

  async function generate() {
    setLoading(true)
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const [{ data: tasks }, { data: wins }, { data: scripts }] = await Promise.all([
        sb.from('tasks').select('id,title,state,category').gte('created_at', weekAgo),
        sb.from('wins').select('id,title,category').gte('created_at', weekAgo),
        sb.from('scripts').select('id,topic,status').gte('created_at', weekAgo),
      ])
      const done = (tasks || []).filter(t => t.state === 'done')
      setSummary({
        tasks_created: tasks?.length || 0,
        tasks_done:    done.length,
        wins:          wins?.length || 0,
        scripts:       scripts?.length || 0,
        done_list:     done.slice(0, 6).map(t => t.title),
        win_list:      (wins || []).slice(0, 4).map(w => w.title),
        scripts_list:  (scripts || []).slice(0, 4).map(s => s.topic || 'Untitled'),
      })
    } catch { showToast('Failed to generate summary', 'error') }
    setLoading(false)
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>Weekly Summary</div>
        {isTuesday && <span className="badge accent" style={{ fontSize: 9, letterSpacing: 1 }}>TUESDAY</span>}
      </div>
      {!summary ? (
        <div className="card" style={{ padding: '14px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            {isTuesday
              ? "It's Tuesday — time for your weekly review."
              : "Generate a summary of the past 7 days."}
          </div>
          <button className="btn" style={{ fontSize: 11 }} onClick={generate} disabled={loading}>
            {loading ? 'Loading…' : '↻ Generate'}
          </button>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { n: `${summary.tasks_done}/${summary.tasks_created}`, l: 'Tasks Done' },
              { n: summary.wins,    l: 'Wins' },
              { n: summary.scripts, l: 'Scripts' },
            ].map(s => (
              <div key={s.l} style={{ textAlign: 'center', padding: '10px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--cyan)' }}>{s.n}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>
          {summary.done_list.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="detail-label" style={{ marginBottom: 4 }}>Completed</div>
              {summary.done_list.map((t, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text2)', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>✓ {t}</div>
              ))}
            </div>
          )}
          {summary.win_list.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="detail-label" style={{ marginBottom: 4 }}>Wins</div>
              {summary.win_list.map((w, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text2)', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>🏆 {w}</div>
              ))}
            </div>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 11, width: '100%', marginTop: 4 }} onClick={() => setSummary(null)}>
            Reset
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Shift Timer ────────────────────────────────────────────── */
function ShiftTimer() {
  const [shiftState,    setShiftState]    = useState('idle')
  const [startTime,     setStartTime]     = useState(null)
  const [pausedAt,      setPausedAt]      = useState(null)
  const [pausedSecs,    setPausedSecs]    = useState(0)
  const [tick,          setTick]          = useState(0)
  const [editingStart,  setEditingStart]  = useState(false)
  const [editValue,     setEditValue]     = useState('')
  const [todayWorked,   setTodayWorked]   = useState(0)   // accumulated seconds from past sessions today
  const tickRef = useRef(null)

  // Load persisted shift + today's worked time
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SHIFT_KEY)
      if (saved) {
        const { state, startISO, pausedAtISO, ps } = JSON.parse(saved)
        if (state && state !== 'idle' && startISO) {
          setShiftState(state); setStartTime(new Date(startISO))
          setPausedAt(pausedAtISO ? new Date(pausedAtISO) : null)
          setPausedSecs(ps || 0)
        }
      }
    } catch {}
    loadTodayWorked()
  }, [])

  function loadTodayWorked() {
    try {
      const pht = phtNow()
      const today = pht.toISOString().slice(0, 10)
      const days  = JSON.parse(localStorage.getItem(WORKDAYS_KEY) || '{}')
      setTodayWorked(days[today] || 0)
    } catch {}
  }

  function saveTodayWorked(extraSecs) {
    try {
      const pht   = phtNow()
      const today = pht.toISOString().slice(0, 10)
      const days  = JSON.parse(localStorage.getItem(WORKDAYS_KEY) || '{}')
      days[today] = (days[today] || 0) + extraSecs
      localStorage.setItem(WORKDAYS_KEY, JSON.stringify(days))
      setTodayWorked(days[today])
    } catch {}
  }

  // Persist shift state
  useEffect(() => {
    if (shiftState === 'idle') { localStorage.removeItem(SHIFT_KEY) }
    else {
      localStorage.setItem(SHIFT_KEY, JSON.stringify({
        state: shiftState, startISO: startTime?.toISOString() || null,
        pausedAtISO: pausedAt?.toISOString() || null, ps: pausedSecs,
      }))
    }
  }, [shiftState, startTime, pausedAt, pausedSecs])

  // Tick
  useEffect(() => {
    if (shiftState === 'running') {
      tickRef.current = setInterval(() => setTick(t => t + 1), 1000)
    } else { clearInterval(tickRef.current) }
    return () => clearInterval(tickRef.current)
  }, [shiftState])

  function getElapsed() {
    if (!startTime) return 0
    const base   = Math.floor((Date.now() - startTime.getTime()) / 1000)
    const paused = pausedSecs + (pausedAt ? Math.floor((Date.now() - pausedAt.getTime()) / 1000) : 0)
    return Math.max(0, base - paused)
  }

  function getRemaining() { return Math.max(0, SHIFT_SECS - getElapsed()) }

  function startShift() {
    setStartTime(new Date()); setPausedSecs(0); setPausedAt(null); setShiftState('running')
  }

  function pauseShift() { setPausedAt(new Date()); setShiftState('paused') }

  function resumeShift() {
    if (pausedAt) { const extra = Math.floor((Date.now() - pausedAt.getTime()) / 1000); setPausedSecs(s => s + extra); setPausedAt(null) }
    setShiftState('running')
  }

  function endShift() {
    const elapsed = getElapsed()
    if (elapsed > 0) saveTodayWorked(elapsed)
    setShiftState('idle'); setStartTime(null); setPausedAt(null); setPausedSecs(0); setEditingStart(false)
  }

  function openEditStart() {
    if (!startTime) return
    setEditValue(`${String(startTime.getHours()).padStart(2,'0')}:${String(startTime.getMinutes()).padStart(2,'0')}`)
    setEditingStart(true)
  }

  function saveEditStart() {
    const [h, m] = editValue.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) { setEditingStart(false); return }
    const newStart = new Date(); newStart.setHours(h, m, 0, 0)
    if (newStart > new Date()) newStart.setDate(newStart.getDate() - 1)
    setStartTime(newStart); setPausedSecs(0); setPausedAt(null); setEditingStart(false)
  }

  const elapsed   = getElapsed()
  const remaining = getRemaining()
  const overTime  = elapsed > SHIFT_SECS ? elapsed - SHIFT_SECS : 0
  const cls = remaining < 900 ? 'shift-big alert' : remaining < 3600 ? 'shift-big warn' : 'shift-big'

  // Today's total = past sessions + current session elapsed
  const sessionTotal = shiftState !== 'idle' ? elapsed : 0
  const totalToday   = todayWorked + sessionTotal
  const totalOver    = totalToday > SHIFT_SECS ? totalToday - SHIFT_SECS : 0

  return (
    <div className="card">
      <div className="shift-big-label">SHIFT ENDS</div>

      {shiftState === 'idle'
        ? <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--text3)', letterSpacing: 2, margin: '4px 0' }}>—</div>
        : <div className={cls}>{formatCountdown(remaining)}</div>
      }
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>5:00 AM PHT</div>

      {shiftState !== 'idle' && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,254,250,0.06)', borderRadius: 6, border: '1px solid rgba(0,254,250,0.15)' }}>
          {/* Start time row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            {editingStart ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Started at</span>
                <input type="time" value={editValue} onChange={e => setEditValue(e.target.value)}
                  style={{ fontFamily: 'var(--font)', fontSize: 12, background: 'var(--deeper)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text)', width: 90 }}
                  autoFocus onKeyDown={e => { if (e.key === 'Enter') saveEditStart(); if (e.key === 'Escape') setEditingStart(false) }}
                />
                <button className="copy-btn" onClick={saveEditStart}>Save</button>
                <button className="copy-btn" onClick={() => setEditingStart(false)}>✕</button>
              </div>
            ) : (
              <>
                <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Started {startTime ? `${String(startTime.getHours()).padStart(2,'0')}:${String(startTime.getMinutes()).padStart(2,'0')}` : '—'}
                </span>
                <button className="copy-btn" style={{ fontSize: 10 }} onClick={openEditStart}>Edit</button>
              </>
            )}
          </div>
          {/* Elapsed */}
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
            {shiftState === 'running' ? 'Elapsed' : 'Paused at'}
          </div>
          <div style={{ fontWeight: 600, fontSize: 22, color: shiftState === 'paused' ? 'var(--text3)' : 'var(--cyan)' }}>
            {formatCountdown(elapsed)}
          </div>
          {overTime > 0 && (
            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>+{formatCountdown(overTime)} over shift</div>
          )}
        </div>
      )}

      {/* Today's work summary */}
      {totalToday > 0 && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Today</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{formatCountdown(totalToday)} worked</span>
            {totalOver > 0 && (
              <span style={{ fontSize: 11, color: 'var(--danger)' }}>+{formatCountdown(totalOver)} over</span>
            )}
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
            clearInterval(timerRef.current); setRunning(false)
            if (!isBreak) { setSessions(n => Math.min(n + 1, 4)); setIsBreak(true); setSecs(BREAK_SECS) }
            else { setIsBreak(false); setSecs(WORK_SECS) }
            return 0
          }
          return s - 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [running, isBreak])

  function reset() { clearInterval(timerRef.current); setRunning(false); setIsBreak(false); setSecs(WORK_SECS); setSessions(0) }

  return (
    <div className="card">
      <div className="pomo-wrap">
        <div>
          <div className="pomo-label">{isBreak ? 'BREAK' : 'FOCUS'}</div>
          <div className={`pomo-display${isBreak ? ' break' : ''}`}>{formatCountdown(secs)}</div>
        </div>
        <div className="pomo-btns">
          <button className="pomo-btn" onClick={() => setRunning(r => !r)}>{running ? 'Pause' : 'Start'}</button>
          <button className="pomo-btn" onClick={reset}>Reset</button>
        </div>
        <div className="pomo-dots">
          {[0,1,2,3].map(i => <div key={i} className={`pomo-dot${i < sessions ? ' done' : ''}`} />)}
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
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 14)
      const { data } = await sb.from('goals').select('id,title,deadline,status').neq('status', 'hit')
        .not('deadline', 'is', null).lte('deadline', cutoff.toISOString().slice(0, 10)).order('deadline', { ascending: true }).limit(5)
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
            const label    = overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d left`
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
    {
      name: 'TikTok',  abbr: 'TT', color: '#00C2A8',
      followers:       data?.tiktok?.followers,
      avg_views:       data?.tiktok?.avg_views,
      videos_week:     data?.tiktok?.videos_this_week,
      ok:              data?.tiktok?.success,
      snapshot_date:   data?.tiktok?.snapshot_date,
    },
    {
      name: 'YouTube', abbr: 'YT', color: '#FF0000',
      followers:       data?.youtube?.subscribers,
      avg_views:       data?.youtube?.avg_views,
      videos_week:     data?.youtube?.videos_this_week,
      total_views:     data?.youtube?.total_views,
      ok:              data?.youtube?.success,
    },
    {
      name: 'Instagram', abbr: 'IG', color: '#E1306C',
      followers: null, avg_views: null, videos_week: null, ok: false,
    },
  ]

  return (
    <div className="card">
      <div className="card-title">Social Snapshot</div>
      {loading
        ? <div className="skeleton" style={{ height: 90 }} />
        : (
          <div>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px 52px 38px', gap: 6, padding: '4px 0 8px', borderBottom: '1px solid var(--border)' }}>
              <span />
              <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Platform</span>
              <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Followers</span>
              <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Avg Views</span>
              <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Videos</span>
            </div>
            {rows.map(r => (
              <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px 52px 38px', gap: 6, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 22, height: 22, borderRadius: 5, background: r.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                  {r.abbr}
                </span>
                <span style={{ fontSize: 12 }}>
                  {r.name}
                  {r.snapshot_date && <span style={{ display: 'block', fontSize: 9, color: 'var(--text3)' }}>{r.snapshot_date}</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>{r.followers != null ? fmtN(r.followers) : '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>{r.avg_views != null ? fmtN(r.avg_views) : '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>{r.videos_week != null ? r.videos_week : '—'}</span>
              </div>
            ))}
            {data?.youtube?.total_views != null && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, textAlign: 'right' }}>
                YT total views: {fmtN(data.youtube.total_views)}
              </div>
            )}
          </div>
        )
      }
    </div>
  )
}
