type ToastType = 'success' | 'error' | 'info' | 'warning'

const COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-500 text-white',
  error: 'bg-rose-500 text-white',
  info: 'bg-sky-500 text-white',
  warning: 'bg-amber-500 text-slate-900'
}

let host: HTMLDivElement | null = null

function ensureHost(): HTMLDivElement {
  if (host) return host
  host = document.createElement('div')
  host.className = 'fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none'
  document.body.appendChild(host)
  return host
}

export function toast(message: string, type: ToastType = 'info', durationMs = 4000): void {
  const h = ensureHost()
  const el = document.createElement('div')
  el.className = `pointer-events-auto shadow-card px-4 py-3 min-w-[240px] max-w-[420px] fade-in rounded-brand ${COLORS[type]}`
  el.textContent = message
  h.appendChild(el)
  setTimeout(() => {
    el.style.transition = 'opacity 150ms ease'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 160)
  }, durationMs)
}
