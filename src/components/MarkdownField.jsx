import { useState, useRef, useEffect } from 'react'
import MarkdownText from './MarkdownText.jsx'

export default function MarkdownField({ value, onChange, placeholder, rows = 3 }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (editing) {
    return (
      <textarea
        ref={ref}
        className="task-modal-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        placeholder={placeholder}
        rows={rows}
      />
    )
  }

  return (
    <div className={`md-field-view${!value ? ' empty' : ''}`} onClick={() => setEditing(true)}>
      {value ? <MarkdownText>{value}</MarkdownText> : (placeholder || 'Click to add...')}
    </div>
  )
}
