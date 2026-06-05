export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function fmtDate(iso) {
  return iso ? String(iso).slice(0, 10) : '—'
}

export function fmtN(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

export function daysBetween(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / 86_400_000)
}

export function phtNow() {
  const now = new Date()
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 8 * 3600000)
}

export function nextShiftEnd() {
  const pht = phtNow()
  const end = new Date(pht)
  end.setHours(5, 0, 0, 0)
  if (pht >= end) end.setDate(end.getDate() + 1)
  return end
}

export function secsUntilShiftEnd() {
  const pht = phtNow()
  const end = nextShiftEnd()
  return Math.max(0, Math.floor((end - pht) / 1000))
}

export function formatCountdown(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
