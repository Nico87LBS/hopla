import moment from 'moment'
import Calendar from 'react-calendar'

import { useLocalization } from '../../contexts/LocalizationContext'
import { getPriorityColor } from '../../utils/Colors'
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
        const choreDate = new Date(chore.nextDueDate).toLocaleDateString()
        const tileDate = date.toLocaleDateString()
        return choreDate === tileDate
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
                backgroundColor: getPriorityColor(dayChores[0].priority),
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
                  backgroundColor: getPriorityColor(chore.priority),
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
          moment(date).format('dd').charAt(0).toUpperCase()
        }
        formatMonth={(locale, date) => moment(date).format('MMM')}
      />
    </div>
  )
}

export default CalendarMonthly
