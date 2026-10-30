import moment from 'moment'
import Calendar from 'react-calendar'

import { useLocalization } from '../../contexts/LocalizationContext'
import { TASK_COLOR } from '../../utils/Colors'
import { familyDay, pickedDay } from '../../utils/familyTime'
import styles from './Calendar.module.css'
const CalendarMonthly = ({ chores, onDateChange }) => {
  const { firstDayOfWeek } = useLocalization()
  const calendarType =
    firstDayOfWeek === 1
      ? 'iso8601'
      : firstDayOfWeek === 6
        ? 'islamic'
        : 'gregory'
  const tileContent = ({ date, view }) => {
    if (view === 'month') {
      const dayChores = chores.filter(chore => {
        // The tile is a day of the calendar, the task's day the family's.
        return (
          chore.nextDueDate && familyDay(chore.nextDueDate) === pickedDay(date)
        )
      })
      if (dayChores.length === 0) {
        return (
          <div className={styles.dotContainer}>
            <span className={styles.dotEmpty}></span>
          </div>
        )
      }
      if (dayChores.length > 3) {
        return (
          <div className={styles.dotContainer}>
            <span
              className={styles.dotWithLine}
              style={{
                backgroundColor: TASK_COLOR.ANYTIME,
              }}
            ></span>
          </div>
        )
      }

      return (
        <div className={styles.dotContainer}>
          {dayChores.map((chore, index) => {
            return (
              <span
                key={index}
                className={styles.dot}
                style={{
                  backgroundColor: TASK_COLOR.ANYTIME,
                }}
              ></span>
            )
          })}
        </div>
      )
    }
    return null
  }
  return (
    <div className={styles.reactCalendar}>
      <Calendar
        tileContent={tileContent}
        calendarType={calendarType}
        onChange={d => {
          onDateChange(new Date(d))
        }}
        // one-letter weekdays and short month names, in the app's language
        formatShortWeekday={(locale, date) =>
          moment.weekdaysMin(date.getDay()).charAt(0).toUpperCase()
        }
        formatMonth={(locale, date) => moment.monthsShort(date.getMonth())}
      />
    </div>
  )
}

export default CalendarMonthly
