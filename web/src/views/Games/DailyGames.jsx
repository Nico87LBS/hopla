import {
  AddRounded,
  AutoAwesomeRounded,
  BoltRounded,
  CheckRounded,
  DeleteOutlineRounded,
  LocalFireDepartmentRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  Option,
  Select,
  Sheet,
  Stack,
  Switch,
  Typography,
} from '@mui/joy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import moment from 'moment'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '../../contexts/LocalizationContext'
import { useNotification } from '../../service/NotificationProvider'
import {
  DeleteBonusPeriod,
  GetBonusPeriods,
  GetGameRules,
  GetGamesToday,
  SaveBonusPeriod,
  SaveGameRules,
} from '../../utils/Fetcher'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import { MemberAvatar, memberShape, surfaceSx } from './GameParts'
import { ChallengesCard, QuestsCard, RanksCard } from './Progression'

const MULTIPLIERS = [2, 3, 4, 5]

const useGamesToday = () =>
  useQuery({
    queryKey: ['games', 'today'],
    queryFn: async () => (await GetGamesToday())?.res || null,
    // The surprise and the periods change with the day, not only with events.
    refetchInterval: 10 * 60 * 1000,
  })

const useBonusPeriods = () =>
  useQuery({
    queryKey: ['games', 'periods'],
    queryFn: async () => (await GetBonusPeriods())?.res || [],
  })

const refreshGames = queryClient =>
  queryClient.invalidateQueries({ queryKey: ['games'] })

// The games of the day: a bonus period running now, the surprise task and
// everyone's streak.
const TodayCard = ({ members, today }) => {
  const { t } = useTranslation('games')
  const { fmt } = useLocalization()
  const byId = new Map(members.map(m => [m.userId, m]))
  const streaks = (today?.streaks || [])
    .filter(s => byId.has(s.userId))
    .sort((a, b) => b.current - a.current)

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg' sx={{ mb: 1.5 }}>
        {t('today.title')}
      </Typography>
      <Stack gap={1.25}>
        {today?.period && (
          <Chip
            size='lg'
            variant='soft'
            color='warning'
            startDecorator={<BoltRounded />}
            sx={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}
          >
            {t('today.period', {
              multiplier: today.period.multiplier,
              name: today.period.name,
              end: fmt.calendar(today.period.endsAt),
            })}
          </Chip>
        )}
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
          <AutoAwesomeRounded sx={{ color: 'primary.plainColor' }} />
          <Typography level='body-md'>
            {!today?.rules?.surpriseEnabled
              ? t('today.surpriseOff')
              : today?.surprise
                ? t('today.surprise', {
                    name: today.surprise.name,
                    points: today.surprise.points,
                  })
                : t('today.noSurprise')}
          </Typography>
        </Box>
        <Typography level='title-sm' sx={{ mt: 1 }}>
          {t('today.streaks')}
        </Typography>
        {streaks.map(streak => {
          const member = byId.get(streak.userId)
          return (
            <Box
              key={streak.userId}
              sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}
            >
              <MemberAvatar member={member} />
              <Typography level='body-md' sx={{ flex: 1 }}>
                {member.displayName}
              </Typography>
              {streak.doneToday && (
                <CheckRounded
                  sx={{ color: 'success.plainColor' }}
                  titleAccess={t('today.doneToday')}
                />
              )}
              <Chip
                variant='soft'
                color={streak.current > 0 ? 'danger' : 'neutral'}
                startDecorator={<LocalFireDepartmentRounded />}
              >
                {t('today.days', { count: streak.current })}
              </Chip>
              <Typography
                level='body-xs'
                sx={{
                  color: 'text.tertiary',
                  minWidth: 70,
                  textAlign: 'right',
                }}
              >
                {t('today.best', { count: streak.best })}
              </Typography>
            </Box>
          )
        })}
        {today?.rules?.streakEvery > 0 && today?.rules?.streakBonus > 0 && (
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
            {t('today.streakRule', {
              count: today.rules.streakEvery,
              points: today.rules.streakBonus,
            })}
          </Typography>
        )}
      </Stack>
    </Sheet>
  )
}

const toInput = date => moment(date).format('YYYY-MM-DDTHH:mm')

// Double points for a weekend, triple for the holidays: parents plan them.
const PeriodsCard = () => {
  const { t } = useTranslation('games')
  const { fmt } = useLocalization()
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const { data: periods = [] } = useBonusPeriods()
  const [draft, setDraft] = useState(null)
  const [confirm, setConfirm] = useState({})

  const startDraft = () => {
    const start = moment().add(1, 'day').startOf('day')
    setDraft({
      name: '',
      startsAt: toInput(start),
      endsAt: toInput(start.clone().add(2, 'days')),
      multiplier: 2,
    })
  }

  const save = async () => {
    const resp = await SaveBonusPeriod({
      name: draft.name.trim(),
      startsAt: moment(draft.startsAt).toISOString(),
      endsAt: moment(draft.endsAt).toISOString(),
      multiplier: draft.multiplier,
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      showNotification({
        type: 'error',
        message: body.error || t('periods.failed'),
      })
      return
    }
    setDraft(null)
    refreshGames(queryClient)
  }

  const remove = period =>
    setConfirm({
      isOpen: true,
      title: t('periods.deleteTitle'),
      message: t('periods.deleteMessage', { name: period.name }),
      confirmText: t('presets.delete'),
      cancelText: t('presets.cancel'),
      color: 'danger',
      onClose: async confirmed => {
        setConfirm({})
        if (!confirmed) return
        await DeleteBonusPeriod(period.id)
        refreshGames(queryClient)
      },
    })

  const now = new Date()
  const state = period =>
    new Date(period.endsAt) <= now
      ? 'ended'
      : new Date(period.startsAt) <= now
        ? 'running'
        : 'planned'
  const validDraft =
    draft &&
    draft.name.trim() &&
    moment(draft.endsAt).isAfter(moment(draft.startsAt))

  return (
    <Sheet sx={surfaceSx}>
      <Box sx={{ alignItems: 'center', display: 'flex', mb: 1.5 }}>
        <Stack sx={{ flex: 1 }}>
          <Typography level='title-lg'>{t('periods.title')}</Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('periods.subtitle')}
          </Typography>
        </Stack>
        <Button
          size='sm'
          variant='soft'
          startDecorator={<AddRounded />}
          onClick={startDraft}
        >
          {t('presets.add')}
        </Button>
      </Box>

      {draft && (
        <Stack gap={1} sx={{ mb: 1.5 }}>
          <Input
            size='sm'
            autoFocus
            placeholder={t('periods.name')}
            value={draft.name}
            onChange={event => setDraft({ ...draft, name: event.target.value })}
            slotProps={{ input: { maxLength: 60 } }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <Input
              size='sm'
              type='datetime-local'
              value={draft.startsAt}
              onChange={event =>
                setDraft({ ...draft, startsAt: event.target.value })
              }
              startDecorator={t('periods.from')}
              sx={{ flex: 1 }}
            />
            <Input
              size='sm'
              type='datetime-local'
              value={draft.endsAt}
              onChange={event =>
                setDraft({ ...draft, endsAt: event.target.value })
              }
              startDecorator={t('periods.to')}
              sx={{ flex: 1 }}
            />
            <Select
              size='sm'
              value={draft.multiplier}
              onChange={(event, value) =>
                setDraft({ ...draft, multiplier: value })
              }
              sx={{ minWidth: 90 }}
            >
              {MULTIPLIERS.map(m => (
                <Option key={m} value={m}>
                  ×{m}
                </Option>
              ))}
            </Select>
          </Stack>
          <Stack direction='row' gap={1}>
            <Button size='sm' disabled={!validDraft} onClick={save}>
              {t('presets.save')}
            </Button>
            <Button size='sm' variant='plain' onClick={() => setDraft(null)}>
              {t('presets.cancel')}
            </Button>
          </Stack>
        </Stack>
      )}

      {periods.length === 0 && !draft && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('periods.empty')}
        </Typography>
      )}
      <Stack gap={0.75}>
        {periods.map(period => (
          <Box
            key={period.id}
            sx={{ alignItems: 'center', display: 'flex', gap: 1 }}
          >
            <Chip
              size='sm'
              variant='soft'
              color='warning'
              sx={{ minWidth: 44, justifyContent: 'center' }}
            >
              ×{period.multiplier}
            </Chip>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography level='body-md' noWrap>
                {period.name}
              </Typography>
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {fmt.dateTime(period.startsAt)} → {fmt.dateTime(period.endsAt)}
              </Typography>
            </Stack>
            <Chip
              size='sm'
              variant='outlined'
              color={state(period) === 'running' ? 'success' : 'neutral'}
            >
              {t(`periods.state.${state(period)}`)}
            </Chip>
            <IconButton
              size='sm'
              color='danger'
              aria-label={t('presets.delete')}
              onClick={() => remove(period)}
            >
              <DeleteOutlineRounded />
            </IconButton>
          </Box>
        ))}
      </Stack>
      {confirm.isOpen && <ConfirmationModal config={confirm} />}
    </Sheet>
  )
}

const NumberField = ({ disabled, endDecorator, label, onChange, value }) => (
  <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
    <Typography level='body-sm' sx={{ flex: 1 }}>
      {label}
    </Typography>
    <Input
      size='sm'
      type='number'
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      endDecorator={endDecorator}
      slotProps={{ input: { min: 0, max: 1000, step: 1 } }}
      sx={{ width: 130 }}
    />
  </Box>
)

// How streaks and surprises pay out in this family.
export const RulesCard = () => {
  const { t } = useTranslation('games')
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const { data: saved } = useQuery({
    queryKey: ['games', 'rules'],
    queryFn: async () => (await GetGameRules())?.res || null,
  })
  const [rules, setRules] = useState(null)
  useEffect(() => {
    if (saved) setRules(saved)
  }, [saved])
  const changed = useMemo(
    () => rules && JSON.stringify(rules) !== JSON.stringify(saved),
    [rules, saved],
  )
  if (!rules) return null

  const set = (key, value) => setRules({ ...rules, [key]: value })
  const save = async () => {
    const resp = await SaveGameRules({
      streakEvery: Number(rules.streakEvery) || 0,
      streakBonus: Number(rules.streakBonus) || 0,
      surpriseEnabled: rules.surpriseEnabled,
      surpriseBonus: Number(rules.surpriseBonus) || 0,
      questsPerWeek: Number(rules.questsPerWeek) || 0,
    })
    if (!resp.ok) {
      showNotification({ type: 'error', message: t('rules.failed') })
      return
    }
    showNotification({ type: 'success', message: t('rules.saved') })
    refreshGames(queryClient)
  }

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg' sx={{ mb: 0.5 }}>
        {t('rules.title')}
      </Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 2 }}>
        {t('rules.subtitle')}
      </Typography>
      <Stack gap={1.25}>
        <NumberField
          label={t('rules.streakEvery')}
          value={rules.streakEvery}
          onChange={value => set('streakEvery', value)}
          endDecorator={t('rules.days')}
        />
        <NumberField
          label={t('rules.streakBonus')}
          value={rules.streakBonus}
          onChange={value => set('streakBonus', value)}
          endDecorator={t('rules.points')}
        />
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
          <Typography level='body-sm' sx={{ flex: 1 }}>
            {t('rules.surpriseEnabled')}
          </Typography>
          <Switch
            checked={rules.surpriseEnabled}
            onChange={event => set('surpriseEnabled', event.target.checked)}
          />
        </Box>
        <NumberField
          label={t('rules.surpriseBonus')}
          value={rules.surpriseBonus}
          disabled={!rules.surpriseEnabled}
          onChange={value => set('surpriseBonus', value)}
          endDecorator={t('rules.points')}
        />
        <NumberField
          label={t('rules.questsPerWeek')}
          value={rules.questsPerWeek}
          onChange={value => set('questsPerWeek', value)}
          endDecorator={t('rules.quests')}
        />
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {t('rules.help')}
        </Typography>
        <Button
          size='sm'
          disabled={!changed}
          onClick={save}
          sx={{ alignSelf: 'flex-start' }}
        >
          {t('presets.save')}
        </Button>
      </Stack>
    </Sheet>
  )
}

const DailyGames = ({ isParent, members }) => {
  const { data: today } = useGamesToday()
  return (
    <>
      <TodayCard members={members} today={today} />
      <RanksCard members={members} today={today} />
      <QuestsCard members={members} today={today} />
      <ChallengesCard isParent={isParent} members={members} today={today} />
      {isParent && <PeriodsCard />}
    </>
  )
}

const todayShape = PropTypes.shape({
  period: PropTypes.object,
  rules: PropTypes.object,
  streaks: PropTypes.array,
  surprise: PropTypes.object,
})

TodayCard.propTypes = {
  members: PropTypes.arrayOf(memberShape).isRequired,
  today: todayShape,
}
NumberField.propTypes = {
  disabled: PropTypes.bool,
  endDecorator: PropTypes.node,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
}
DailyGames.propTypes = {
  isParent: PropTypes.bool,
  members: PropTypes.arrayOf(memberShape).isRequired,
}

export default DailyGames
