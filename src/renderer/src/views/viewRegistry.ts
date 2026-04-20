import type { CelebEventComputed } from '@shared/types'
import { todayHighlight } from './TodayHighlight'
import { weeklyView } from './WeeklyView'
import { monthlyCalendar } from './MonthlyCalendar'
import { upcomingList } from './UpcomingList'
import { peopleGallery } from './PeopleGallery'
import { memberOfMonthView } from './MemberOfMonthView'
import { attendanceView } from './AttendanceView'
import { qrCodesView } from './QRCodesView'

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
export const VIEW_REGISTRY: ViewConfig[] = [
  { id: 'today', label: 'Today', icon: '🎉', component: todayHighlight },
  { id: 'motm', label: 'Member', icon: '⭐', component: memberOfMonthView },
  { id: 'attendance', label: 'Attendance', icon: '🏆', component: attendanceView },
  { id: 'weekly', label: 'Week', icon: '📅', component: weeklyView },
  { id: 'monthly', label: 'Month', icon: '🗓', component: monthlyCalendar },
  { id: 'upcoming', label: 'Upcoming', icon: '⏳', component: upcomingList },
  { id: 'gallery', label: 'People', icon: '👥', component: peopleGallery },
  { id: 'qrcodes', label: 'QR Codes', icon: '📱', component: qrCodesView }
]

export function getViewById(id: string): ViewConfig | undefined {
  return VIEW_REGISTRY.find((v) => v.id === id)
}
