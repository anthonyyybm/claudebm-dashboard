import { useState, useEffect, useCallback } from 'react'
import { registerToastHandler } from './lib/toast.js'
import Sidebar   from './components/Sidebar.jsx'
import Overview  from './components/Overview.jsx'
import Board     from './components/Board.jsx'
import Goals     from './components/Goals.jsx'
import Plans     from './components/Plans.jsx'
import Wins      from './components/Wins.jsx'
import Blockers  from './components/Blockers.jsx'
import Reels     from './components/Reels.jsx'

export default function App() {
  const [active, setActive]   = useState('overview')
  const [toasts, setToasts]   = useState([])
  const [fontsReady, setFontsReady] = useState(false)

  // Wait for fonts then hide loading screen
  useEffect(() => {
    document.fonts.ready.then(() => {
      setTimeout(() => setFontsReady(true), 200)
    })
  }, [])

  // Toast system
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

  if (!fontsReady) {
    return (
      <div className="loading-screen">
        <div className="loading-bm">BM</div>
        <div className="loading-label">BOOSTED MOVERS</div>
        <div className="loading-dots">
          <span /><span /><span />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar active={active} setActive={setActive} />
        <main className="main-content">
          {/* All panels always in DOM — toggled by display */}
          <Overview active={active === 'overview'} setActive={setActive} />
          <Board    active={active === 'board'} />
          <Goals    active={active === 'goals'} />
          <Plans    active={active === 'plans'} />
          <Wins     active={active === 'wins'} />
          <Blockers active={active === 'blockers'} />
          <Reels    active={active === 'reels'} />
        </main>
      </div>

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type || 'info'}`}>{t.msg}</div>
        ))}
      </div>
    </>
  )
}
