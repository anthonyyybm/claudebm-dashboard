import { useState, useEffect } from 'react'
import { registerConfirmHandler } from '../lib/confirm.js'

export default function ConfirmModal() {
  const [state, setState] = useState(null)

  useEffect(() => {
    registerConfirmHandler((message, opts = {}) => {
      return new Promise(resolve => {
        setState({ message, ...opts, resolve })
      })
    })
  }, [])

  if (!state) return null

  function close(result) {
    state.resolve(result)
    setState(null)
  }

  return (
    <div className="confirm-overlay" onClick={() => close(false)}>
      <div className="confirm-card" onClick={e => e.stopPropagation()}>
        {state.title && <div className="confirm-title">{state.title}</div>}
        <div className="confirm-message">{state.message}</div>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={() => close(false)}>{state.cancelLabel || 'Cancel'}</button>
          <button className={`btn${state.danger ? ' btn-danger' : ''}`} onClick={() => close(true)}>{state.confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}
