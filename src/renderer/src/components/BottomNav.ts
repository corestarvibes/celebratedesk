import { getState, setState, subscribe } from '../state'
import { VIEW_REGISTRY } from '../views/viewRegistry'

export function bottomNav(): HTMLElement {
  const nav = document.createElement('nav')
  nav.className =
    'h-14 flex items-center justify-around border-t border-slate-400/10 surface rounded-none'
  nav.style.borderRadius = '0'

  const buttons = VIEW_REGISTRY.map((v) => {
    const btn = document.createElement('button')
    btn.className = 'icon-btn flex flex-col items-center gap-0.5 text-xs px-3'
    btn.dataset.viewId = v.id
    btn.setAttribute('aria-label', v.label)
    btn.innerHTML = `<span class="text-xl leading-none">${v.icon}</span><span>${v.label}</span>`
    btn.addEventListener('click', async () => {
      setState({ activeView: v.id })
      await window.celebAPI.settings.set('activeView', v.id)
    })
    nav.appendChild(btn)
    return btn
  })

  const render = (): void => {
    const active = getState().activeView
    for (const b of buttons) {
      if (b.dataset.viewId === active) {
        b.classList.add('text-brand-primary')
        b.style.color = 'var(--brand-primary)'
      } else {
        b.classList.remove('text-brand-primary')
        b.style.color = ''
      }
    }
  }

  subscribe(render)
  render()
  return nav
}
