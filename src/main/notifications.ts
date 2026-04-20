// Electron notifications wrapper. Respects the notificationsEnabled setting
// and checks Notification.isSupported() before each call.

import { Notification } from 'electron'
import { logger } from '@utils/logger'
import { getSetting } from './store'

export function notify(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    if (!getSetting('notificationsEnabled')) return
    new Notification({ title, body, silent: false }).show()
  } catch (err) {
    logger.warn('notify failed', err)
  }
}

export function notifySummary(todayCount: number, weekCount: number): void {
  if (todayCount === 0 && weekCount === 0) return
  const parts: string[] = []
  if (todayCount > 0) parts.push(`🎉 ${todayCount} today`)
  if (weekCount > 0) parts.push(`${weekCount} this week`)
  notify('CelebrateDesk', parts.join(' · '))
}
