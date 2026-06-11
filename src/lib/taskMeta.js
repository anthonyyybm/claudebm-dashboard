export const STATUS_OPTIONS = [
  { value: 'idea',        label: 'Idea',        color: 'var(--text3)' },
  { value: 'backlog',     label: 'Backlog',     color: 'var(--text3)' },
  { value: 'up_next',     label: 'Up Next',     color: 'var(--teal)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--cyan)' },
  { value: 'blocked',     label: 'Blocked',     color: '#ff4444' },
  { value: 'in_review',   label: 'In Review',   color: 'var(--yellow)' },
  { value: 'done',        label: 'Done',        color: '#4ade80' },
]

export const PRIORITY_OPTIONS = [
  { value: 'high',   label: 'High',   color: 'var(--danger)' },
  { value: 'medium', label: 'Medium', color: 'var(--amber)' },
  { value: 'low',    label: 'Low',    color: 'var(--text3)' },
]

export function statusMeta(value) {
  return STATUS_OPTIONS.find(s => s.value === value) || STATUS_OPTIONS[0]
}

export function priorityMeta(value) {
  return PRIORITY_OPTIONS.find(p => p.value === value) || PRIORITY_OPTIONS[1]
}
