import { useState, useRef, useEffect } from 'react'

export default function PropChipSelect({ value, options, onChange, colorOf }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = options.find(o => o.value === value) || options[0]
  const currentColor = colorOf ? colorOf(current) : current.color

  return (
    <div className="prop-chip-dropdown" ref={ref}>
      <button
        type="button"
        className="task-prop-chip prop-chip-trigger"
        style={{ '--chip-color': currentColor }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="task-prop-chip-label">{current.label}</span>
        <span className="prop-chip-caret">▾</span>
      </button>
      {open && (
        <div className="prop-chip-menu">
          {options.map(o => {
            const c = colorOf ? colorOf(o) : o.color
            return (
              <button
                type="button"
                key={o.value}
                className={`prop-chip-menu-item${o.value === value ? ' active' : ''}`}
                style={{ '--chip-color': c }}
                onClick={() => { onChange(o.value); setOpen(false) }}
              >
                <span className="prop-chip-menu-dot" />
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
