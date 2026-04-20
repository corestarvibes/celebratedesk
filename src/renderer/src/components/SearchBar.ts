import { refreshEvents, setState } from '../state'

export function searchBar(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'relative w-full max-w-md'
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Search names or notes…'
  input.className =
    'w-full h-[36px] px-3 rounded-brand border border-slate-300/30 bg-transparent focus:outline-none focus:border-brand-primary text-sm'
  let t: ReturnType<typeof setTimeout> | null = null
  input.addEventListener('input', () => {
    setState({ searchQuery: input.value })
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      void refreshEvents()
    }, 200)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = ''
      setState({ searchQuery: '' })
      void refreshEvents()
      input.blur()
    }
  })
  wrap.appendChild(input)
  return wrap
}
