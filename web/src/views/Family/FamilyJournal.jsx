import {
  AddRounded,
  GroupsRounded,
  RedeemRounded,
  RemoveRounded,
  ReplayRounded,
  SchoolRounded,
  StarRounded,
  TaskAltRounded,
} from '@mui/icons-material'
import { Box, Button, Sheet, Stack, Typography } from '@mui/joy'
import { useInfiniteQuery } from '@tanstack/react-query'
import moment from 'moment'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useLocalization } from '../../contexts/LocalizationContext'
import { familyDay } from '../../utils/familyTime'
import { GetJournal } from '../../utils/Fetcher'
import { MemberAvatar, memberShape, surfaceSx } from '../Games/GameParts'

const PAGE_SIZE = 30
const KINDS = ['all', 'task', 'game', 'bonus', 'reward']

// The icon, colours and sign of each kind of row, as on the child's sheet of
// the family card.
const LOOKS = {
  task: {
    icon: TaskAltRounded,
    color: HOPLA.violet,
    bg: HOPLA.violetSoft,
    sign: 1,
  },
  undo: {
    icon: ReplayRounded,
    color: 'neutral.500',
    bg: 'neutral.softBg',
    sign: -1,
  },
  bonus: { icon: AddRounded, color: HOPLA.green, bg: HOPLA.greenSoft, sign: 1 },
  penalty: {
    icon: RemoveRounded,
    color: HOPLA.red,
    bg: HOPLA.redSoft,
    sign: -1,
  },
  redeem: {
    icon: RedeemRounded,
    color: HOPLA.goldText,
    bg: HOPLA.goldSoft,
    sign: -1,
  },
  game: {
    icon: SchoolRounded,
    color: HOPLA.carrotText,
    bg: HOPLA.carrotSoft,
    sign: 1,
  },
  reset: {
    icon: ReplayRounded,
    color: 'neutral.500',
    bg: 'neutral.softBg',
    sign: -1,
  },
}

// How a row moved the hops earned: spending on a reward only moves the
// balance left to spend, and a reset is not a day's doing.
const earnedChange = entry =>
  ['task', 'bonus', 'game'].includes(entry.action)
    ? entry.points
    : ['undo', 'penalty'].includes(entry.action)
      ? -entry.points
      : 0

const useJournal = (userId, kind) =>
  useInfiniteQuery({
    queryKey: ['journal', userId || 'all', kind],
    queryFn: async ({ pageParam }) =>
      (await GetJournal({
        userId,
        kind: kind === 'all' ? '' : kind,
        before: pageParam,
        limit: PAGE_SIZE,
      })) || { res: [] },
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.next || null,
  })

const Hops = ({ color, value }) => (
  <Box
    component='span'
    sx={{ alignItems: 'center', color, display: 'inline-flex', gap: 0.25 }}
  >
    {value > 0 ? `+${value}` : `−${-value}`}
    <StarRounded aria-hidden sx={{ color: HOPLA.gold, fontSize: 14 }} />
  </Box>
)

Hops.propTypes = { color: PropTypes.string, value: PropTypes.number.isRequired }

// The family journal: everything that happened, by day, for everyone or one
// member, narrowed to one kind of row.
const FamilyJournal = ({ members }) => {
  const { t } = useTranslation('games')
  const { fmt } = useLocalization()
  const [userId, setUserId] = useState(null)
  const [kind, setKind] = useState('all')
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useJournal(userId, kind)
  const byId = useMemo(
    () => new Map(members.map(m => [m.userId, m])),
    [members],
  )

  const days = useMemo(() => {
    const list = []
    for (const entry of data?.pages.flatMap(page => page.res || []) || []) {
      const key = familyDay(entry.createdAt)
      let day = list[list.length - 1]
      if (day?.key !== key) list.push((day = { key, entries: [], earned: 0 }))
      day.entries.push(entry)
      day.earned += earnedChange(entry)
    }
    return list
  }, [data])

  const dayName = key => {
    const day = moment(key, 'YYYY-MM-DD')
    if (key === familyDay(new Date())) return t('journal.today')
    if (key === familyDay(moment().subtract(1, 'day'))) {
      return t('journal.yesterday')
    }
    return day.format('dddd D MMMM')
  }

  const who = (id, label, avatar) => {
    const on = userId === id
    return (
      <Box
        key={id ?? 'all'}
        component='button'
        type='button'
        aria-pressed={on}
        onClick={() => setUserId(id)}
        sx={{
          alignItems: 'center',
          bgcolor: on ? 'background.surface' : 'transparent',
          border: 0,
          borderRadius: 999,
          boxShadow: on ? 'sm' : 'none',
          color: on ? 'text.primary' : 'text.secondary',
          cursor: 'pointer',
          display: 'flex',
          font: 'inherit',
          fontWeight: 700,
          gap: 1,
          pl: 0.5,
          pr: 1.75,
          py: 0.5,
          '& .MuiAvatar-root': { opacity: on ? 1 : 0.6 },
        }}
      >
        {avatar}
        {label}
      </Box>
    )
  }

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg' sx={{ mb: 1.5 }}>
        {t('journal.title')}
      </Typography>
      <Box
        role='group'
        sx={{
          bgcolor: 'neutral.softBg',
          borderRadius: 24,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.5,
          p: 0.5,
        }}
      >
        {who(
          null,
          t('journal.everyone'),
          <Box
            sx={{
              alignItems: 'center',
              bgcolor: HOPLA.violetSoft,
              borderRadius: '50%',
              color: HOPLA.violet,
              display: 'flex',
              height: 30,
              justifyContent: 'center',
              width: 30,
            }}
          >
            <GroupsRounded sx={{ fontSize: 18 }} />
          </Box>,
        )}
        {members.map(m =>
          who(m.userId, m.displayName, <MemberAvatar member={m} size={30} />),
        )}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.75 }}>
        {KINDS.map(k => (
          <Box
            key={k}
            component='button'
            type='button'
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            sx={{
              bgcolor: kind === k ? 'text.primary' : 'neutral.softBg',
              border: 0,
              borderRadius: 999,
              color: kind === k ? 'background.surface' : 'text.secondary',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              px: 1.5,
              py: 0.875,
            }}
          >
            {t(`journal.kinds.${k}`)}
          </Box>
        ))}
      </Box>

      {days.map(day => (
        <Box key={day.key}>
          <Box
            sx={{
              alignItems: 'baseline',
              display: 'flex',
              justifyContent: 'space-between',
              mb: 0.5,
              mt: 2,
              mx: 0.25,
            }}
          >
            <Typography
              level='body-xs'
              sx={{
                color: 'text.secondary',
                fontWeight: 700,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}
            >
              {dayName(day.key)}
            </Typography>
            {day.earned !== 0 && (
              <Typography level='body-sm' fontWeight='lg'>
                <Hops
                  value={day.earned}
                  color={day.earned > 0 ? HOPLA.greenText : HOPLA.red}
                />
              </Typography>
            )}
          </Box>
          {day.entries.map(entry => {
            const look = LOOKS[entry.action] || LOOKS.reset
            const Icon = look.icon
            const member = byId.get(entry.userId)
            const by = byId.get(entry.createdBy)
            const sub = [
              userId ? null : member?.displayName,
              t(`journal.actions.${entry.action}`),
              by && by.userId !== entry.userId && entry.action !== 'task'
                ? t('journal.by', { name: by.displayName })
                : null,
              fmt.time(entry.createdAt),
            ].filter(Boolean)
            return (
              <Box
                key={`${entry.source || 'ledger'}-${entry.id}`}
                sx={{
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  gap: 1.5,
                  px: 0.25,
                  py: 1.125,
                }}
              >
                <Box sx={{ flexShrink: 0, position: 'relative' }}>
                  <Box
                    sx={{
                      alignItems: 'center',
                      bgcolor: look.bg,
                      borderRadius: 11,
                      color: look.color,
                      display: 'flex',
                      height: 36,
                      justifyContent: 'center',
                      width: 36,
                    }}
                  >
                    <Icon sx={{ fontSize: 20 }} />
                  </Box>
                  {!userId && member && (
                    <Box
                      sx={{
                        bottom: -4,
                        position: 'absolute',
                        right: -6,
                        borderRadius: '50%',
                        boxShadow:
                          '0 0 0 2px var(--joy-palette-background-surface)',
                      }}
                    >
                      <MemberAvatar member={member} size={18} />
                    </Box>
                  )}
                </Box>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography level='body-md' fontWeight='lg' noWrap>
                    {entry.reason || t(`journal.actions.${entry.action}`)}
                  </Typography>
                  <Typography
                    level='body-xs'
                    noWrap
                    sx={{ color: 'text.tertiary' }}
                  >
                    {sub.join(' · ')}
                  </Typography>
                </Stack>
                {entry.points > 0 && (
                  <Stack sx={{ alignItems: 'flex-end', flexShrink: 0 }}>
                    <Typography level='title-sm' fontWeight='xl'>
                      <Hops
                        value={look.sign * entry.points}
                        color={
                          entry.action === 'redeem'
                            ? HOPLA.goldText
                            : look.sign > 0
                              ? HOPLA.greenText
                              : look.color
                        }
                      />
                    </Typography>
                    {entry.action === 'redeem' && (
                      <Typography
                        level='body-xs'
                        sx={{ color: 'text.tertiary' }}
                      >
                        {t('journal.onBalance')}
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            )
          })}
        </Box>
      ))}

      {!isLoading && days.length === 0 && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary', mt: 2 }}>
          {t('journal.empty')}
        </Typography>
      )}
      {hasNextPage && (
        <Button
          variant='soft'
          loading={isFetchingNextPage}
          onClick={() => fetchNextPage()}
          sx={{ mt: 1.5, width: '100%' }}
        >
          {t('journal.more')}
        </Button>
      )}
    </Sheet>
  )
}

FamilyJournal.propTypes = {
  members: PropTypes.arrayOf(memberShape).isRequired,
}

export default FamilyJournal
