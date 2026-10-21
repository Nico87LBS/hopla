import {
  AddRounded,
  CheckCircleRounded,
  DeleteOutlineRounded,
  EmojiEventsRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  LinearProgress,
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
import { useChores } from '../../queries/ChoreQueries'
import { useNotification } from '../../service/NotificationProvider'
import {
  DeleteChallenge,
  DeleteQuest,
  GetChallenges,
  GetQuests,
  GetRanks,
  SaveChallenge,
  SaveQuest,
  SaveRanks,
} from '../../utils/Fetcher'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import { MemberAvatar, memberShape, surfaceSx } from './GameParts'

const refreshGames = queryClient =>
  queryClient.invalidateQueries({ queryKey: ['games'] })

const percent = (value, target) =>
  target > 0 ? Math.min(100, Math.round((value * 100) / target)) : 0

// What a quest or challenge asks, such as "Set the table 5 times".
const useGoalText = () => {
  const { t } = useTranslation('games')
  const { data: choresData } = useChores()
  const names = useMemo(
    () => new Map((choresData?.res || []).map(c => [c.id, c.name])),
    [choresData?.res],
  )
  return goal => {
    if (goal.kind === 'tasks' && goal.choreId) {
      return t('goals.oneTask', {
        count: goal.target,
        name: names.get(goal.choreId) || '?',
      })
    }
    return t(`goals.${goal.kind}`, { count: goal.target })
  }
}

const sendOrWarn = async (resp, showNotification, fallback) => {
  if (resp.ok) return true
  const body = await resp.json().catch(() => ({}))
  showNotification({ type: 'error', message: body.error || fallback })
  return false
}

// A rank shows its drawn badge when it has one, its emoji otherwise.
export const RankIcon = ({ rank, size = 22 }) =>
  rank?.image ? (
    <Box
      component='img'
      src={`/ranks/${rank.image}.svg`}
      alt=''
      sx={{ display: 'block', flexShrink: 0, height: size, width: size }}
    />
  ) : (
    rank?.icon || null
  )

// Prestige stars, earned each time a member goes past the last rank.
export const starsLabel = stars =>
  !stars ? '' : stars <= 3 ? '⭐'.repeat(stars) : `⭐×${stars}`

// Each member's rank, from the points earned since joining, and the way to
// the next one.
export const RanksCard = ({ members, today }) => {
  const { t } = useTranslation('games')
  const byId = new Map(members.map(m => [m.userId, m]))
  const progress = (today?.members || [])
    .filter(p => byId.has(p.userId))
    .sort((a, b) => b.earned - a.earned)
  if (progress.length === 0) return null

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg' sx={{ mb: 1.5 }}>
        {t('ranks.title')}
      </Typography>
      <Stack gap={1.75}>
        {progress.map(p => {
          const member = byId.get(p.userId)
          // Past the last rank, the gauge leads to the next prestige star.
          const target = p.next ? p.next.minPoints : p.starAt
          return (
            <Box key={p.userId}>
              <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
                <MemberAvatar member={member} />
                <Typography level='body-md' sx={{ flex: 1 }}>
                  {member.displayName}
                </Typography>
                <Chip
                  variant='soft'
                  color='primary'
                  startDecorator={<RankIcon rank={p.rank} size={26} />}
                >
                  {starsLabel(p.stars)} {p.rank.name}
                </Chip>
              </Box>
              <LinearProgress
                determinate
                value={
                  target
                    ? percent(
                        p.points - p.rank.minPoints,
                        target - p.rank.minPoints,
                      )
                    : 100
                }
                sx={{ mt: 1 }}
              />
              <Typography
                level='body-xs'
                sx={{ color: 'text.tertiary', mt: 0.5 }}
              >
                {p.next
                  ? t('ranks.toNext', {
                      count: p.next.minPoints - p.points,
                      name: `${p.next.icon} ${p.next.name}`,
                    })
                  : p.starAt
                    ? t('ranks.toStar', { count: p.starAt - p.points })
                    : t('ranks.top', { count: p.earned })}
              </Typography>
            </Box>
          )
        })}
      </Stack>
    </Sheet>
  )
}

const GoalBar = ({ detail, done, label, progress, reward, target }) => {
  const { t } = useTranslation('games')
  return (
    <Box>
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
        {done ? (
          <CheckCircleRounded sx={{ color: 'success.plainColor' }} />
        ) : null}
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='body-sm'>{label}</Typography>
          {detail && (
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
              {detail}
            </Typography>
          )}
        </Stack>
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {progress}/{target}
        </Typography>
        {reward > 0 && (
          <Chip size='sm' variant='soft' color='success'>
            {t('goals.reward', { count: reward })}
          </Chip>
        )}
      </Box>
      <LinearProgress
        determinate
        color={done ? 'success' : 'primary'}
        value={done ? 100 : percent(progress, target)}
        sx={{ mt: 0.5 }}
      />
    </Box>
  )
}

// Everyone's quests of the week and of the month.
export const QuestsCard = ({ members, today }) => {
  const { t } = useTranslation('games')
  const { fmt } = useLocalization()
  const goalText = useGoalText()
  const byId = new Map(members.map(m => [m.userId, m]))
  const withQuests = (today?.members || []).filter(
    p => byId.has(p.userId) && p.quests?.length > 0,
  )

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg' sx={{ mb: 0.5 }}>
        {t('quests.title')}
      </Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('quests.subtitle')}
      </Typography>
      {withQuests.length === 0 && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('quests.none')}
        </Typography>
      )}
      <Stack gap={2}>
        {withQuests.map(p => {
          const member = byId.get(p.userId)
          return (
            <Stack key={p.userId} gap={1}>
              <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                <MemberAvatar member={member} size={24} />
                <Typography level='title-sm'>{member.displayName}</Typography>
              </Box>
              {p.quests.map(quest => (
                <GoalBar
                  key={quest.id}
                  done={Boolean(quest.completedAt)}
                  label={quest.name}
                  detail={`${goalText(quest)} · ${t('quests.until', {
                    end: fmt.calendar(moment(quest.endsAt).subtract(1, 's')),
                  })}`}
                  progress={quest.progress}
                  target={quest.target}
                  reward={quest.reward}
                />
              ))}
            </Stack>
          )
        })}
      </Stack>
    </Sheet>
  )
}

const emptyGoal = () => ({
  name: '',
  kind: 'tasks',
  choreId: null,
  target: 5,
  reward: 10,
  userIds: [],
})

// The fields quests and challenges share.
const GoalFields = ({ draft, kinds, members, setDraft }) => {
  const { t } = useTranslation('games')
  const { data: choresData } = useChores()
  const chores = (choresData?.res || []).filter(c => c.isActive !== false)
  const set = (key, value) => setDraft({ ...draft, [key]: value })
  const toggle = userId =>
    set(
      'userIds',
      draft.userIds.includes(userId)
        ? draft.userIds.filter(id => id !== userId)
        : [...draft.userIds, userId],
    )

  return (
    <>
      <Input
        size='sm'
        autoFocus
        placeholder={t('goals.name')}
        value={draft.name}
        onChange={event => set('name', event.target.value)}
        slotProps={{ input: { maxLength: 80 } }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
        <Select
          size='sm'
          value={draft.kind}
          onChange={(event, value) =>
            setDraft({ ...draft, kind: value, choreId: null })
          }
          sx={{ minWidth: 170 }}
        >
          {kinds.map(kind => (
            <Option key={kind} value={kind}>
              {t(`goals.kind.${kind}`)}
            </Option>
          ))}
        </Select>
        {draft.kind === 'tasks' && (
          <Select
            size='sm'
            value={draft.choreId}
            placeholder={t('goals.anyTask')}
            onChange={(event, value) => set('choreId', value)}
            sx={{ flex: 1, minWidth: 0 }}
          >
            <Option value={null}>{t('goals.anyTask')}</Option>
            {chores.map(chore => (
              <Option key={chore.id} value={chore.id}>
                {chore.name}
              </Option>
            ))}
          </Select>
        )}
      </Stack>
      <Stack direction='row' gap={1}>
        <Input
          size='sm'
          type='number'
          value={draft.target}
          onChange={event => set('target', event.target.value)}
          startDecorator={t('goals.target')}
          slotProps={{ input: { min: 1, max: 10000 } }}
          sx={{ flex: 1 }}
        />
        <Input
          size='sm'
          type='number'
          value={draft.reward}
          onChange={event => set('reward', event.target.value)}
          startDecorator={t('goals.rewardLabel')}
          slotProps={{ input: { min: 0, max: 1000 } }}
          sx={{ flex: 1 }}
        />
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        <Typography level='body-sm' sx={{ alignSelf: 'center', mr: 0.5 }}>
          {t('goals.members')}
        </Typography>
        {members.map(member => (
          <Chip
            key={member.userId}
            variant={draft.userIds.includes(member.userId) ? 'solid' : 'soft'}
            color={
              draft.userIds.includes(member.userId) ? 'primary' : 'neutral'
            }
            onClick={() => toggle(member.userId)}
          >
            {member.displayName}
          </Chip>
        ))}
        {draft.userIds.length === 0 && (
          <Typography level='body-xs' sx={{ alignSelf: 'center' }}>
            {t('goals.everyone')}
          </Typography>
        )}
      </Box>
    </>
  )
}

const goalPayload = draft => ({
  name: draft.name.trim(),
  kind: draft.kind,
  choreId: draft.kind === 'tasks' ? draft.choreId : null,
  target: Number(draft.target) || 0,
  reward: Number(draft.reward) || 0,
  userIds: draft.userIds,
})

const validGoal = draft =>
  draft && draft.name.trim() && Number(draft.target) >= 1

const useConfirmDelete = () => {
  const { t } = useTranslation('games')
  const [confirm, setConfirm] = useState({})
  const ask = (title, message, action) =>
    setConfirm({
      isOpen: true,
      title,
      message,
      confirmText: t('presets.delete'),
      cancelText: t('presets.cancel'),
      color: 'danger',
      onClose: async confirmed => {
        setConfirm({})
        if (confirmed) await action()
      },
    })
  const modal = confirm.isOpen ? <ConfirmationModal config={confirm} /> : null
  return [ask, modal]
}

const CardHeader = ({ onAdd, subtitle, title }) => {
  const { t } = useTranslation('games')
  return (
    <Box sx={{ alignItems: 'center', display: 'flex', mb: 1.5 }}>
      <Stack sx={{ flex: 1 }}>
        <Typography level='title-lg'>{title}</Typography>
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          {subtitle}
        </Typography>
      </Stack>
      {onAdd && (
        <Button
          size='sm'
          variant='soft'
          startDecorator={<AddRounded />}
          onClick={onAdd}
        >
          {t('presets.add')}
        </Button>
      )}
    </Box>
  )
}

// The quests parents prepare, drawn by the children each Monday.
export const QuestListCard = ({ members }) => {
  const { t } = useTranslation('games')
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const goalText = useGoalText()
  const { data: quests = [] } = useQuery({
    queryKey: ['games', 'quests'],
    queryFn: async () => (await GetQuests())?.res || [],
  })
  const [draft, setDraft] = useState(null)
  const [askDelete, modal] = useConfirmDelete()
  const byId = new Map(members.map(m => [m.userId, m]))

  const save = async () => {
    const resp = await SaveQuest({
      ...goalPayload(draft),
      period: draft.period,
    })
    if (await sendOrWarn(resp, showNotification, t('quests.failed'))) {
      setDraft(null)
      refreshGames(queryClient)
    }
  }

  return (
    <Sheet sx={surfaceSx}>
      <CardHeader
        title={t('quests.listTitle')}
        subtitle={t('quests.listSubtitle')}
        onAdd={() => setDraft({ ...emptyGoal(), period: 'week' })}
      />
      {draft && (
        <Stack gap={1} sx={{ mb: 1.5 }}>
          <GoalFields
            draft={draft}
            setDraft={setDraft}
            members={members}
            kinds={['tasks', 'points', 'streak']}
          />
          <Select
            size='sm'
            value={draft.period}
            onChange={(event, value) => setDraft({ ...draft, period: value })}
            sx={{ alignSelf: 'flex-start', minWidth: 170 }}
          >
            <Option value='week'>{t('quests.weekly')}</Option>
            <Option value='month'>{t('quests.monthly')}</Option>
          </Select>
          <Stack direction='row' gap={1}>
            <Button size='sm' disabled={!validGoal(draft)} onClick={save}>
              {t('presets.save')}
            </Button>
            <Button size='sm' variant='plain' onClick={() => setDraft(null)}>
              {t('presets.cancel')}
            </Button>
          </Stack>
        </Stack>
      )}
      {quests.length === 0 && !draft && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('quests.empty')}
        </Typography>
      )}
      <Stack gap={0.75}>
        {quests.map(quest => (
          <Box
            key={quest.id}
            sx={{ alignItems: 'center', display: 'flex', gap: 1 }}
          >
            <Chip size='sm' variant='outlined'>
              {t(quest.period === 'month' ? 'quests.monthly' : 'quests.weekly')}
            </Chip>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography level='body-md' noWrap>
                {quest.name}
              </Typography>
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {goalText(quest)}
                {quest.userIds?.length > 0 &&
                  ` · ${quest.userIds
                    .map(id => byId.get(id)?.displayName || '?')
                    .join(', ')}`}
              </Typography>
            </Stack>
            <Chip size='sm' variant='soft' color='success'>
              {t('goals.reward', { count: quest.reward })}
            </Chip>
            <IconButton
              size='sm'
              color='danger'
              aria-label={t('presets.delete')}
              onClick={() =>
                askDelete(
                  t('quests.deleteTitle'),
                  t('quests.deleteMessage', { name: quest.name }),
                  async () => {
                    await DeleteQuest(quest.id)
                    refreshGames(queryClient)
                  },
                )
              }
            >
              <DeleteOutlineRounded />
            </IconButton>
          </Box>
        ))}
      </Stack>
      {modal}
    </Sheet>
  )
}

const toInput = date => moment(date).format('YYYY-MM-DDTHH:mm')

// Dated challenges, alone or as a family: the gauges for everyone, and the
// planning for parents.
export const ChallengesCard = ({ isParent, members, today }) => {
  const { t } = useTranslation('games')
  const { fmt } = useLocalization()
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const goalText = useGoalText()
  const { data: planned = [] } = useQuery({
    queryKey: ['games', 'challenges'],
    queryFn: async () => (await GetChallenges())?.res || [],
    enabled: isParent,
  })
  const [draft, setDraft] = useState(null)
  const [askDelete, modal] = useConfirmDelete()
  const byId = new Map(members.map(m => [m.userId, m]))
  const running = today?.challenges || []
  const upcoming = planned.filter(c => new Date(c.startsAt) > new Date())

  const startDraft = () => {
    const start = moment().startOf('hour')
    setDraft({
      ...emptyGoal(),
      kind: 'points',
      target: 100,
      reward: 0,
      rewardText: '',
      shared: true,
      startsAt: toInput(start),
      endsAt: toInput(start.clone().add(7, 'days').endOf('day')),
      userIds: members.filter(m => m.role === 'member').map(m => m.userId),
    })
  }

  const save = async () => {
    const resp = await SaveChallenge({
      ...goalPayload(draft),
      rewardText: draft.rewardText.trim(),
      shared: draft.shared,
      startsAt: moment(draft.startsAt).toISOString(),
      endsAt: moment(draft.endsAt).toISOString(),
    })
    if (await sendOrWarn(resp, showNotification, t('challenges.failed'))) {
      setDraft(null)
      refreshGames(queryClient)
    }
  }

  const remove = challenge =>
    askDelete(
      t('challenges.deleteTitle'),
      t('challenges.deleteMessage', { name: challenge.name }),
      async () => {
        await DeleteChallenge(challenge.id)
        refreshGames(queryClient)
      },
    )

  if (!isParent && running.length === 0) return null

  const deleteButton = challenge =>
    isParent && (
      <IconButton
        size='sm'
        color='danger'
        aria-label={t('presets.delete')}
        onClick={() => remove(challenge)}
      >
        <DeleteOutlineRounded />
      </IconButton>
    )

  return (
    <Sheet sx={surfaceSx}>
      <CardHeader
        title={t('challenges.title')}
        subtitle={t('challenges.subtitle')}
        onAdd={isParent ? startDraft : null}
      />
      {draft && (
        <Stack gap={1} sx={{ mb: 1.5 }}>
          <GoalFields
            draft={draft}
            setDraft={setDraft}
            members={members}
            kinds={['points', 'tasks']}
          />
          <Input
            size='sm'
            placeholder={t('challenges.rewardText')}
            value={draft.rewardText}
            onChange={event =>
              setDraft({ ...draft, rewardText: event.target.value })
            }
            slotProps={{ input: { maxLength: 120 } }}
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
          </Stack>
          <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
            <Typography level='body-sm' sx={{ flex: 1 }}>
              {t('challenges.sharedLabel')}
            </Typography>
            <Switch
              checked={draft.shared}
              onChange={event =>
                setDraft({ ...draft, shared: event.target.checked })
              }
            />
          </Box>
          <Stack direction='row' gap={1}>
            <Button
              size='sm'
              disabled={
                !validGoal(draft) ||
                !moment(draft.endsAt).isAfter(moment(draft.startsAt))
              }
              onClick={save}
            >
              {t('presets.save')}
            </Button>
            <Button size='sm' variant='plain' onClick={() => setDraft(null)}>
              {t('presets.cancel')}
            </Button>
          </Stack>
        </Stack>
      )}
      {running.length === 0 && upcoming.length === 0 && !draft && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('challenges.empty')}
        </Typography>
      )}
      <Stack gap={2}>
        {running.map(challenge => {
          const ended = new Date(challenge.endsAt) <= new Date()
          const reached = challenge.shared
            ? Boolean(challenge.completedAt)
            : challenge.winners.length > 0
          return (
            <Stack key={challenge.id} gap={0.75}>
              <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                <EmojiEventsRounded
                  sx={{
                    color: reached ? 'warning.plainColor' : 'text.tertiary',
                  }}
                />
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography level='title-sm'>{challenge.name}</Typography>
                  <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                    {goalText(challenge)} ·{' '}
                    {ended
                      ? t('challenges.ended')
                      : t('challenges.until', {
                          end: fmt.calendar(challenge.endsAt),
                        })}
                  </Typography>
                </Stack>
                <Chip size='sm' variant='outlined'>
                  {t(
                    challenge.shared ? 'challenges.shared' : 'challenges.solo',
                  )}
                </Chip>
                {deleteButton(challenge)}
              </Box>
              {challenge.shared ? (
                <GoalBar
                  done={reached}
                  label={challenge.members
                    .map(id => byId.get(id)?.displayName)
                    .filter(Boolean)
                    .join(' + ')}
                  progress={challenge.total}
                  target={challenge.target}
                  reward={challenge.reward}
                />
              ) : (
                challenge.members
                  .filter(id => byId.has(id))
                  .map(id => (
                    <GoalBar
                      key={id}
                      done={challenge.winners.includes(id)}
                      label={byId.get(id).displayName}
                      progress={Math.min(
                        challenge.progress[id] || 0,
                        challenge.target,
                      )}
                      target={challenge.target}
                      reward={challenge.reward}
                    />
                  ))
              )}
              {challenge.rewardText && (
                <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
                  {t(
                    reached ? 'challenges.rewardWon' : 'challenges.rewardToWin',
                    { reward: challenge.rewardText },
                  )}
                </Typography>
              )}
            </Stack>
          )
        })}
        {upcoming.map(challenge => (
          <Box
            key={challenge.id}
            sx={{ alignItems: 'center', display: 'flex', gap: 1 }}
          >
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography level='body-md' noWrap>
                {challenge.name}
              </Typography>
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {t('challenges.planned', {
                  start: fmt.dateTime(challenge.startsAt),
                })}
              </Typography>
            </Stack>
            {deleteButton(challenge)}
          </Box>
        ))}
      </Stack>
      {modal}
    </Sheet>
  )
}

// The drawn rank badges, from the little rabbit to the chief of the tribe.
const RANK_IMAGES = [1, 2, 3, 4, 5, 6, 7].map(n => `hopla-${n}`)

// Parents can rename the ranks, change their pictures, icons and the points
// they need.
export const RankSettingsCard = () => {
  const { t } = useTranslation('games')
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const { data: saved } = useQuery({
    queryKey: ['games', 'ranks'],
    queryFn: async () => (await GetRanks())?.res || [],
  })
  const [ranks, setRanks] = useState(null)
  useEffect(() => {
    if (saved) setRanks(saved)
  }, [saved])
  if (!ranks) return null

  const set = (index, key, value) =>
    setRanks(ranks.map((r, i) => (i === index ? { ...r, [key]: value } : r)))
  const changed = JSON.stringify(ranks) !== JSON.stringify(saved)
  const save = async () => {
    const resp = await SaveRanks(
      ranks.map(r => ({
        name: r.name.trim(),
        icon: r.icon.trim(),
        image: r.image || '',
        minPoints: Number(r.minPoints) || 0,
      })),
    )
    if (await sendOrWarn(resp, showNotification, t('ranks.failed'))) {
      showNotification({ type: 'success', message: t('ranks.saved') })
      refreshGames(queryClient)
    }
  }

  return (
    <Sheet sx={surfaceSx}>
      <CardHeader
        title={t('ranks.settingsTitle')}
        subtitle={t('ranks.settingsSubtitle')}
        onAdd={
          ranks.length < 12
            ? () =>
                setRanks([
                  ...ranks,
                  {
                    name: '',
                    icon: '⭐',
                    image: '',
                    minPoints:
                      (Number(ranks[ranks.length - 1]?.minPoints) || 0) + 100,
                  },
                ])
            : null
        }
      />
      <Stack gap={0.75}>
        {ranks.map((rank, index) => (
          <Stack key={index} direction='row' gap={1}>
            <Select
              size='sm'
              value={rank.image || ''}
              onChange={(event, value) => set(index, 'image', value || '')}
              aria-label={t('ranks.image')}
              renderValue={() => <RankIcon rank={rank} size={24} />}
              sx={{ minWidth: 0, width: 64 }}
            >
              <Option value=''>{t('ranks.noImage')}</Option>
              {RANK_IMAGES.map(image => (
                <Option key={image} value={image} label={image}>
                  <RankIcon rank={{ image }} size={36} />
                </Option>
              ))}
            </Select>
            <Input
              size='sm'
              value={rank.icon}
              onChange={event => set(index, 'icon', event.target.value)}
              slotProps={{ input: { maxLength: 8 } }}
              sx={{ width: 56 }}
            />
            <Input
              size='sm'
              value={rank.name}
              placeholder={t('ranks.name')}
              onChange={event => set(index, 'name', event.target.value)}
              slotProps={{ input: { maxLength: 60 } }}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Input
              size='sm'
              type='number'
              value={rank.minPoints}
              disabled={index === 0}
              onChange={event => set(index, 'minPoints', event.target.value)}
              endDecorator={t('rules.points')}
              slotProps={{ input: { min: 0 } }}
              sx={{ width: 130 }}
            />
            <IconButton
              size='sm'
              color='danger'
              disabled={ranks.length === 1}
              aria-label={t('presets.delete')}
              onClick={() => setRanks(ranks.filter((r, i) => i !== index))}
            >
              <DeleteOutlineRounded />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Typography level='body-xs' sx={{ color: 'text.tertiary', mt: 1 }}>
        {t('ranks.help')}
      </Typography>
      <Button
        size='sm'
        disabled={!changed || ranks.some(r => !r.name.trim())}
        onClick={save}
        sx={{ mt: 1.5 }}
      >
        {t('presets.save')}
      </Button>
    </Sheet>
  )
}

const todayShape = PropTypes.shape({
  challenges: PropTypes.array,
  members: PropTypes.array,
})

RankIcon.propTypes = {
  rank: PropTypes.shape({ icon: PropTypes.string, image: PropTypes.string }),
  size: PropTypes.number,
}
RanksCard.propTypes = {
  members: PropTypes.arrayOf(memberShape).isRequired,
  today: todayShape,
}
GoalBar.propTypes = {
  detail: PropTypes.string,
  done: PropTypes.bool,
  label: PropTypes.string,
  progress: PropTypes.number.isRequired,
  reward: PropTypes.number,
  target: PropTypes.number.isRequired,
}
QuestsCard.propTypes = {
  members: PropTypes.arrayOf(memberShape).isRequired,
  today: todayShape,
}
GoalFields.propTypes = {
  draft: PropTypes.object.isRequired,
  kinds: PropTypes.arrayOf(PropTypes.string).isRequired,
  members: PropTypes.arrayOf(memberShape).isRequired,
  setDraft: PropTypes.func.isRequired,
}
CardHeader.propTypes = {
  onAdd: PropTypes.func,
  subtitle: PropTypes.string,
  title: PropTypes.string.isRequired,
}
QuestListCard.propTypes = {
  members: PropTypes.arrayOf(memberShape).isRequired,
}
ChallengesCard.propTypes = {
  isParent: PropTypes.bool,
  members: PropTypes.arrayOf(memberShape).isRequired,
  today: todayShape,
}
