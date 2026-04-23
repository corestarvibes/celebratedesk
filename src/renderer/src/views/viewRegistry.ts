import type { CelebEventComputed } from '@shared/types'
import { todayHighlight } from './TodayHighlight'
import { weeklyView } from './WeeklyView'
import { monthlyCalendar } from './MonthlyCalendar'
import { memberOfMonthView } from './MemberOfMonthView'
import { attendanceView } from './AttendanceView'
import { qrCodesView } from './QRCodesView'
import { eventsView } from './EventsView'

export interface ViewContext {
  events: CelebEventComputed[]
  searchQuery: string
  timezone: string
}

export type ViewComponent = (ctx: ViewContext) => HTMLElement

export interface ViewConfig {
  id: string
  label: string
  icon: string
  component: ViewComponent
}

// ADD NEW VIEW HERE — add an entry to this array, create the component file, done.
// Order here = order of the bottom navigation tabs AND the slideshow default order.
export const VIEW_REGISTRY: ViewConfig[] = [
  { id: 'today', label: 'Today', icon: '🎉', component: todayHighlight },
  { id: 'motm', label: 'Member', icon: '⭐', component: memberOfMonthView },
  { id: 'events', label: 'Events', icon: '📅', component: eventsView },
  { id: 'attendance', label: 'Attendance', icon: '🏆', component: attendanceView },
  { id: 'weekly', label: 'Week', icon: '📆', component: weeklyView },
  { id: 'monthly', label: 'Month', icon: '🗓', component: monthlyCalendar },
  { id: 'qrcodes', label: 'QR Codes', icon: '📱', component: qrCodesView }
]

/** View IDs that used to exist but have been removed. The migration in
 *  src/main/store.ts uses this to detect and repair stale stored arrays. */
export const REMOVED_VIEW_IDS = ['gallery', 'upcoming']

export function getViewById(id: string): ViewConfig | undefined {
  return VIEW_REGISTRY.find((v) => v.id === id)
}
