import { useState, useEffect, useCallback } from 'react'
import { registerToastHandler } from './lib/toast.js'
import ConfirmModal from './components/ConfirmModal.jsx'
import Sidebar   from './components/Sidebar.jsx'
import Overview  from './components/Overview.jsx'
import Board     from './components/Board.jsx'
import Goals     from './components/Goals.jsx'
import Plans     from './components/Plans.jsx'
import Wins      from './components/Wins.jsx'
import Blockers  from './components/Blockers.jsx'
import Reels     from './components/Reels.jsx'

export default function App() {
  const [active,    setActive]    = useState('overview')
  const [toasts,    setToasts]    = useState([])
  const [fontsReady,setFontsReady]= useState(false)
  const [theme,     setTheme]     = useState(() => localStorage.getItem('theme') || 'dark')
  const [menuOpen,  setMenuOpen]  = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function toggleTheme() { setTheme(t => t === 'dark' ? 'light' : 'dark') }

  useEffect(() => {
    document.fonts.ready.then(() => { setTimeout(() => setFontsReady(true), 200) })
  }, [])

  useEffect(() => {
    registerToastHandler((msg, type) => {
      const id = Date.now() + Math.random()
      setToasts(prev => [...prev, { id, msg, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
    })
  }, [])

  // Global "C" key → focus Quick Capture
  const handleKey = useCallback((e) => {
    if (e.key !== 'c' && e.key !== 'C') return
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
    setActive('overview')
    setTimeout(() => document.getElementById('quick-capture-input')?.focus(), 60)
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Close menu on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function navigate(id) {
    setActive(id)
    setMenuOpen(false)
  }

  if (!fontsReady) {
    return (
      <div className="loading-screen">
        <div className="loading-bm">BM</div>
        <div className="loading-label">BOOSTED MOVERS</div>
        <div className="loading-dots"><span /><span /><span /></div>
      </div>
    )
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar
          active={active}
          setActive={navigate}
          theme={theme}
          toggleTheme={toggleTheme}
          menuOpen={menuOpen}
        />

        {/* Overlay — tapping it closes the drawer */}
        {menuOpen && <div className="mobile-overlay" onClick={() => setMenuOpen(false)} />}

        <main className="main-content">
          {/* Mobile top bar */}
          <div className="mobile-topbar">
            <button className="hamburger-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Open menu">
              <span /><span /><span />
            </button>
            <div className="mobile-topbar-brand">
              <div className="mobile-topbar-brand-mark">BM</div>
              <span className="mobile-topbar-brand-text">Boosted Movers</span>
            </div>
          </div>

          <Overview active={active === 'overview'} setActive={navigate} />
          <Board    active={active === 'board'} />
          <Goals    active={active === 'goals'} />
          <Plans    active={active === 'plans'} />
          <Wins     active={active === 'wins'} />
          <Blockers active={active === 'blockers'} />
          <Reels    active={active === 'reels'} />
        </main>
      </div>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type || 'info'}`}>{t.msg}</div>
        ))}
      </div>

      <ConfirmModal />
    </>
  )
}
