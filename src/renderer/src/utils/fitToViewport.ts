export type FitMode = 'css-var' | 'transform'

export interface FitToViewportOptions {
  /**
   * css-var: writes --fit-scale to the target so font sizes and spacing can use it.
   * transform: applies transform: scale(...) to the target for panels with fixed inline sizing.
   */
  mode: FitMode
  minScale?: number
  debounceMs?: number
  onScale?: (scale: number, hitFloor: boolean) => void
}

export interface FitToViewportController {
  fit: () => void
  destroy: () => void
}

/**
 * Shrink content until it fits inside a fixed viewport/container.
 *
 * @example
 * const controller = fitToViewport(panel, inner, {
 *   mode: 'css-var',
 *   minScale: 0.8,
 *   onScale: (scale) => inner.style.setProperty('--title-scale', String(Math.max(0.9, scale)))
 * })
 * // CSS/inline styles can then use: calc(34px * var(--fit-scale, 1))
 */
export function fitToViewport(
  container: HTMLElement,
  target: HTMLElement,
  options: FitToViewportOptions
): FitToViewportController {
  const minScale = options.minScale ?? 0.7
  const debounceMs = options.debounceMs ?? 80
  let frame = 0
  let timeout = 0
  let destroyed = false

  if (options.mode === 'transform') {
    const parent = target.parentElement
    const parentPosition = parent ? getComputedStyle(parent).position : 'static'
    if (!parent || parentPosition === 'static') {
      throw new Error('fitToViewport transform mode requires the target to have a positioned parent.')
    }
    target.style.transformOrigin = 'top left'
  }

  const applyScale = (scale: number): void => {
    if (options.mode === 'css-var') {
      target.style.setProperty('--fit-scale', String(scale))
    } else {
      target.style.transform = `scale(${scale})`
      target.style.width = `calc(100% / ${scale})`
      target.style.height = `calc(100% / ${scale})`
    }
  }

  const resetMeasure = (): void => {
    if (options.mode === 'css-var') {
      target.style.setProperty('--fit-scale', '1')
    } else {
      target.style.transform = 'scale(1)'
      target.style.width = '100%'
      target.style.height = 'auto'
    }
  }

  const overflows = (scale: number): boolean => {
    if (options.mode === 'transform') {
      return (
        target.scrollHeight * scale > container.clientHeight + 1 ||
        target.scrollWidth * scale > container.clientWidth + 1
      )
    }
    return target.scrollHeight > container.clientHeight + 1 || target.scrollWidth > container.clientWidth + 1
  }

  const fit = (): void => {
    if (destroyed) return
    if (!container.isConnected || !target.isConnected) {
      controller.destroy()
      return
    }
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      resetMeasure()
      if (!overflows(1)) {
        applyScale(1)
        options.onScale?.(1, false)
        return
      }

      let lo = minScale
      let hi = 1
      applyScale(lo)
      const floorFits = !overflows(lo)
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2
        applyScale(mid)
        if (overflows(mid)) hi = mid
        else lo = mid
      }

      const scale = floorFits ? lo : minScale
      applyScale(scale)
      const hitFloor = scale <= minScale + 0.002 && overflows(scale)
      options.onScale?.(scale, hitFloor)
    })
  }

  const schedule = (): void => {
    window.clearTimeout(timeout)
    timeout = window.setTimeout(fit, debounceMs)
  }

  const resizeObserver = new ResizeObserver(schedule)
  resizeObserver.observe(container)
  resizeObserver.observe(target)
  window.addEventListener('resize', schedule)

  const controller: FitToViewportController = {
    fit,
    destroy: () => {
      destroyed = true
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      resizeObserver.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }
  fit()
  return controller
}
