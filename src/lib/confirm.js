let _handler = null

export function registerConfirmHandler(fn) {
  _handler = fn
}

/**
 * Shows the app's confirm modal and resolves to true/false.
 * opts: { title, confirmLabel, cancelLabel, danger }
 */
export function confirmDialog(message, opts = {}) {
  if (!_handler) return Promise.resolve(window.confirm(message))
  return _handler(message, opts)
}
