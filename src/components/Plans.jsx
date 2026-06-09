import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { showToast } from '../lib/toast.js'
import { fmtDate } from '../lib/utils.js'
import TaskModal from './TaskModal.jsx'

const STATUS_COLOR = {
  draft: 'gray', submitted: 'teal', awaiting: 'amber',
  approved: 'green', deferred: 'blue', on_hold: 'coral',
}
const STATUS_ORDER = ['draft', 'submitted', 'awaiting', 'approved', 'deferred', 'on_hold']
const CAT_COLOR = { granny_reels: 'accent', youtube: 'teal', automation: 'purple', analytics: 'yellow', strategy: 'coral', admin: 'gray' }

export default function Plans({ active }) {
  const [plans,      setPlans]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [collapsed,  setCollapsed]  = useState({})
  const [selectedPlan, setSelectedPlan] = useState(null)

  useEffect(() => { if (active) load() }, [active])

  async function load() {
    setLoading(true)
    const { data, error } = await sb.from('tasks').select('*').eq('is_plan', true).order('created_at', { ascending: false })
    if (!error) setPlans(data || [])
    else showToast('Failed to load plans', 'error')
    setLoading(false)
  }

  async function updatePlan(id, patch) {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    setSelectedPlan(prev => prev?.id === id ? { ...prev, ...patch } : prev)
    const { error } = await sb.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Update failed', 'error'); load() }
  }

  async function deletePlan(id) {
    setPlans(prev => prev.filter(p => p.id !== id))
    setSelectedPlan(null)
    const { error } = await sb.from('tasks').delete().eq('id', id)
    if (error) { showToast('Delete failed', 'error'); load() }
    else showToast('Deleted', 'success')
  }

  if (!active) return null

  const grouped = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = plans.filter(p => p.plan_status === s)
    return acc
  }, {})

  return (
    <div className="tab-panel">
      <div className="page-title">Plans</div>
      {loading && <div className="skeleton h-big" />}

      {STATUS_ORDER.map(status => {
        const group = grouped[status]
        if (group.length === 0) return null
        const open = !collapsed[status]
        return (
          <div key={status} className="plan-group">
            <div className="plan-group-header" onClick={() => setCollapsed(c => ({ ...c, [status]: !c[status] }))}>
              <span className={`badge ${STATUS_COLOR[status] || 'gray'}`}>{status.replace('_', ' ')}</span>
              <span className="plan-group-count">{group.length}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
            </div>
            {open && group.map(plan => (
              <PlanCard key={plan.id} plan={plan} onOpen={() => setSelectedPlan(plan)} />
            ))}
          </div>
        )
      })}

      {!loading && plans.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
          No plans yet — flag tasks on the Board with ⚑
        </div>
      )}

      {selectedPlan && (
        <TaskModal
          task={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onUpdate={updatePlan}
          onDelete={deletePlan}
        />
      )}
    </div>
  )
}

/* ─── Plan Card (clickable) ──────────────────────────────────── */
function PlanCard({ plan, onOpen }) {
  return (
    <div className="plan-card plan-card-clickable" onClick={onOpen}>
      <div className="plan-card-body">
        <div className="plan-card-title">{plan.title}</div>
        {plan.notes && <div className="plan-card-notes">{plan.notes}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {plan.category && (
            <span className={`badge ${CAT_COLOR[plan.category] || 'gray'}`}>{plan.category.replace('_', ' ')}</span>
          )}
          {plan.date_submitted && (
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text3)' }}>
              Submitted {fmtDate(plan.date_submitted)}
            </span>
          )}
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>
            {plan.state?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>Open →</span>
      </div>
    </div>
  )
}
