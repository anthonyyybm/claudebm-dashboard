import { secsUntilShiftEnd, formatCountdown } from '../lib/utils.js'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview',  icon: IconGrid },
  { id: 'board',    label: 'Board',     icon: IconKanban },
  { id: 'goals',    label: 'Goals',     icon: IconTarget },
  { id: 'plans',    label: 'Plans',     icon: IconDoc },
  { id: 'wins',     label: 'Wins',      icon: IconTrophy },
  { id: 'blockers', label: 'Blockers',  icon: IconWarn },
  { id: 'reels',    label: 'Reels',     icon: IconFilm },
]

export default function Sidebar({ active, setActive, theme, toggleTheme }) {
  const [secs, setSecs] = useState(secsUntilShiftEnd())

  useEffect(() => {
    const id = setInterval(() => setSecs(secsUntilShiftEnd()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeClass = secs < 900 ? 'shift-mini-time alert' : secs < 3600 ? 'shift-mini-time warn' : 'shift-mini-time'
  const h = Math.floor(secs / 3600)
  const display = h > 0 ? formatCountdown(secs) : formatCountdown(secs)

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">BM</div>
        <span className="sidebar-logo-text">Boosted Movers</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item${active === id ? ' active' : ''}`}
            onClick={() => setActive(id)}
          >
            <Icon />
            <span className="nav-label">{label}</span>
          </button>
        ))}
        <a
          className="nav-item"
          href="analytics/"
          target="_blank"
          rel="noopener"
        >
          <IconExternal />
          <span className="nav-label">Analytics ↗</span>
        </a>
      </nav>

      <div className="sidebar-bottom">
        <div className="shift-mini">
          <span className={timeClass}>{display}</span>
          <span className="shift-mini-label">SHIFT ENDS</span>
        </div>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle light/dark mode">
          <span className="theme-toggle-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span className="nav-label" style={{ fontSize: 11 }}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </aside>
  )
}

/* ─── Icons ──────────────────────────────────────────────────── */
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
function IconKanban() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="4" height="18" rx="1" />
      <rect x="10" y="3" width="4" height="12" rx="1" />
      <rect x="17" y="3" width="4" height="15" rx="1" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}
function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )
}
function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
      <path d="M4 22h16" />
      <path d="M10 22v-3" />
      <path d="M14 22v-3" />
      <path d="M18 3H6v6a6 6 0 0012 0V3z" />
    </svg>
  )
}
function IconWarn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconFilm() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  )
}
function IconExternal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
