import { CalendarMonth } from '@mui/icons-material'
import { Avatar, Box, Chip, Typography } from '@mui/joy'
import moment from 'moment'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useLocalization } from '../../contexts/LocalizationContext'
import { useCircleMembers, useUserProfile } from '../../queries/UserQueries'
import { TASK_COLOR } from '../../utils/Colors'
import {
  familyDay,
  fromPickedDay,
  pickedDay,
  toPickedDay,
} from '../../utils/familyTime'
import CalendarMonthly from './CalendarMonthly'

const getAssigneeColor = (assignee, userProfile) => {
  return assignee === userProfile.id
    ? TASK_COLOR.ASSIGNED_TO_ME
    : TASK_COLOR.ASSIGNED_TO_OTHER
}
const CalendarCard = ({ chores }) => {
  const { t } = useTranslation('chores')
  const { data: userProfile } = useUserProfile()
  const { fmt } = useLocalization()

  const [selectedDate, setSeletedDate] = useState(null)
  const Navigate = useNavigate()

  // Fetch circle members data to get assignee names
  const { data: circleMembersData } = useCircleMembers()
  const circleMembers = circleMembersData?.res || []

  // Auto-update selected calendar date when day changes
  useEffect(() => {
    if (!selectedDate) {
      return
    }

    // The family's next midnight.
    const msUntilTomorrow = moment().add(1, 'day').startOf('day').diff(moment())

    const timeout = setTimeout(() => {
      // Check if selected date is now yesterday and update to today
      if (pickedDay(selectedDate) === familyDay(moment().subtract(1, 'day'))) {
        setSeletedDate(toPickedDay(moment()))
      }
    }, msUntilTomorrow)

    return () => clearTimeout(timeout)
  }, [selectedDate])

  // Helper function to get assignee display name
  const getAssigneeName = assignedTo => {
    if (assignedTo === userProfile.id) {
      return userProfile.displayName
    }
    const assignee = circleMembers.find(member => member.userId === assignedTo)
    return assignee
      ? `${assignee.displayName}`
      : t('calendarCard.assignedToOther')
  }

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Calendar Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1,
          maxWidth: '250px',
          mb: 2,
        }}
      >
        <CalendarMonth />
        <Typography level='title-md'>{t('calendarCard.title')}</Typography>
      </Box>

      <div>
        <CalendarMonthly
          // className={styled.reactCalendar}
          chores={chores}
          onDateChange={date => {
            setSeletedDate(date)
          }}
        />
      </div>

      {selectedDate && (
        <Box
          sx={{
            mt: 2,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <Typography level='title-md'>
              {fmt.date(fromPickedDay(selectedDate))}
            </Typography>
            <Chip variant='soft' color='primary' size='md'>
              {(() => {
                const count = chores.filter(
                  chore =>
                    chore.nextDueDate &&
                    familyDay(chore.nextDueDate) === pickedDay(selectedDate),
                ).length
                return t('calendarCard.tasksCount', { count })
              })()}
            </Chip>
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              // maxHeight: 'calc(100vh - 500px)',
              overflowY: 'auto',
              maxHeight: '170px',

              p: 1,
            }}
          >
            {chores
              .filter(
                chore =>
                  chore.nextDueDate &&
                  familyDay(chore.nextDueDate) === pickedDay(selectedDate),
              )
              .sort((a, b) => moment(a.nextDueDate).diff(moment(b.nextDueDate)))
              .map((chore, idx) => (
                <Box
                  key={idx}
                  onClick={() => {
                    Navigate('/chores/' + chore.id)
                  }}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.25,
                    cursor: 'pointer',
                    position: 'relative',
                    pl: '16px',
                    py: 0.75,
                    transition: 'all 0.2s ease-in-out',
                    borderRadius: 'sm',
                    '&:hover': {
                      // transform: 'translateX(4px)',
                      bgcolor: 'background.level1',
                    },
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: '3px',
                      backgroundColor: TASK_COLOR.ANYTIME,
                      borderRadius: '2px',
                    },
                  }}
                >
                  <Typography
                    level='body-sm'
                    sx={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'text.primary',
                    }}
                  >
                    {chore.name}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Typography
                      level='body-xs'
                      sx={{
                        color: 'neutral.500',
                      }}
                    >
                      {fmt.time(chore.nextDueDate)}
                    </Typography>
                    {/* <Typography
                      level='body-xs'
                      sx={{
                        color: getAssigneeColor(chore.assignedTo, userProfile),
                      }}
                    >
                      {getAssigneeName(chore.assignedTo)}
                    </Typography> */}
                    <Chip
                      variant='soft'
                      color='neutral'
                      size='sm'
                      startDecorator={
                        <Avatar
                          src={
                            circleMembers.find(
                              member => member.userId === chore.assignedTo,
                            )?.image
                          }
                        />
                      }
                      sx={{
                        backgroundColor: getAssigneeColor(
                          chore.assignedTo,
                          userProfile,
                        ),
                        color: 'white',
                      }}
                    >
                      {getAssigneeName(chore.assignedTo)}
                    </Chip>
                  </Box>
                </Box>
              ))}
          </Box>
        </Box>
      )}
    </div>
  )
}

export default CalendarCard
