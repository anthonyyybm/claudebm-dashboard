let _handler = null

export function registerToastHandler(fn) {
  _handler = fn
}

export function showToast(msg, type = 'info') {
  _handler?.(msg, type)
}
