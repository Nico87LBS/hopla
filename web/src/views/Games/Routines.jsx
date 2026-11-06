import {
  DeleteOutlineRounded,
  EditRounded,
  FormatListNumberedRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import moment from 'moment'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useChores, useRoutinesToday } from '../../queries/ChoreQueries'
import { useFamilyMembers } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import {
  DeleteRoutine,
  GetRoutines,
  SaveRoutine,
  SkipRoutineOccurrenceItem,
} from '../../utils/Fetcher'
import { draftFromRoutine, emptyRoutineDraft } from '../../utils/routines'
import { MemberAvatar, surfaceSx } from './GameParts'
import { CardHeader, sendOrWarn, useConfirmDelete } from './Progression'
import { RoutineEditor } from './RoutineEditor'

// The routines of the family that are running now, with the steps a parent
// can skip.
const LiveRoutines = ({ members, onSkip, runs }) => {
  const { t } = useTranslation('games')
  return (
    <Stack
      gap={1}
      sx={{ borderColor: 'divider', borderTop: '1px solid', mt: 2, pt: 1.5 }}
    >
      <Typography level='title-sm'>{t('routines.liveTitle')}</Typography>
      {runs.map(({ occurrence, progress, routine }) => {
        const member = members.find(item => item.userId === progress.userId)
        return (
          <Box
            key={occurrence.id}
            sx={{ bgcolor: 'background.level1', borderRadius: 'md', p: 1 }}
          >
            <Stack direction='row' alignItems='center' gap={1}>
              {member && <MemberAvatar member={member} size={28} />}
              <Typography level='body-sm' fontWeight='lg' sx={{ flex: 1 }}>
                {routine.name}
                {member ? ` · ${member.displayName}` : ''}
              </Typography>
              <Chip
                size='sm'
                color={occurrence.status === 'finished' ? 'success' : 'primary'}
              >
                {t(`routines.runStatus.${occurrence.status}`)}
              </Chip>
            </Stack>
            <Typography
              level='body-xs'
              sx={{ color: 'text.tertiary', mb: 0.75 }}
            >
              {t('routines.expiresAt', {
                time: moment(occurrence.expiresAt).format('dddd HH:mm'),
              })}
            </Typography>
            <Stack gap={0.5}>
              {(occurrence.items || []).map(item => (
                <Stack
                  key={item.id}
                  direction='row'
                  alignItems='center'
                  justifyContent='space-between'
                  gap={1}
                >
                  <Typography level='body-xs' sx={{ flex: 1 }}>
                    {item.choreName}
                    {' · '}
                    {t(`routines.itemStatus.${item.status}`)}
                    {!item.required
                      ? ` · ${t('routines.optional').toLowerCase()}`
                      : ''}
                  </Typography>
                  {item.status === 'pending' && item.available && (
                    <Button
                      size='sm'
                      variant='soft'
                      color='neutral'
                      onClick={() => onSkip(occurrence.id, item.id)}
                    >
                      {t('routines.skip')}
                    </Button>
                  )}
                </Stack>
              ))}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}

LiveRoutines.propTypes = {
  members: PropTypes.array.isRequired,
  onSkip: PropTypes.func.isRequired,
  runs: PropTypes.array.isRequired,
}

// The routines parents chain from tasks: a child sees the steps as they open
// and earns the bonus once the required ones are done.
export const RoutinesCard = () => {
  const { t } = useTranslation('games')
  const { showError, showNotification } = useNotification()
  const queryClient = useQueryClient()
  const { data: choresData } = useChores()
  const { data: todayRoutines = [] } = useRoutinesToday()
  const { data: membersData } = useFamilyMembers()
  const members = useMemo(
    () => (membersData?.res || []).filter(member => member.isActive !== false),
    [membersData?.res],
  )
  const chores = useMemo(() => choresData?.res || [], [choresData?.res])
  const names = useMemo(
    () => new Map(chores.map(chore => [chore.id, chore.name])),
    [chores],
  )
  const { data: routines = [] } = useQuery({
    queryKey: ['games', 'routines'],
    queryFn: async () => (await GetRoutines())?.res || [],
  })
  const [draft, setDraft] = useState(null)
  const [askDelete, modal] = useConfirmDelete()
  const runs = todayRoutines.flatMap(routine =>
    (routine.members || [])
      .filter(progress => progress.occurrence)
      .map(progress => ({
        routine,
        progress,
        occurrence: progress.occurrence,
      })),
  )

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['games'] })
  const skip = async (occurrenceId, itemId) => {
    const response = await SkipRoutineOccurrenceItem(occurrenceId, itemId)
    if (!response.ok) {
      showError(t('routines.skipFailed'))
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['games'] })
    await queryClient.invalidateQueries({ queryKey: ['chores'] })
  }
  const save = async () => {
    const resp = await SaveRoutine({
      id: draft.id,
      name: draft.name.trim(),
      bonus: Number(draft.bonus) || 0,
      validityMinutes: Number(draft.validityMinutes) || 720,
      choreIds: draft.choreIds,
      slotIds: draft.slotIds || [],
      dependencies: draft.dependencies || [],
      optionalStepIds: draft.optionalStepIds || [],
    })
    if (await sendOrWarn(resp, showNotification, t('routines.failed'))) {
      setDraft(null)
      refresh()
    }
  }

  if (draft) {
    return (
      <Sheet sx={surfaceSx}>
        <RoutineEditor
          chores={chores}
          draft={draft}
          names={names}
          routines={routines}
          setDraft={setDraft}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      </Sheet>
    )
  }
  const known = new Set(chores.map(chore => chore.id))
  return (
    <Sheet sx={surfaceSx}>
      <CardHeader
        title={t('routines.title')}
        subtitle={t('routines.subtitle')}
        onAdd={() => setDraft(emptyRoutineDraft())}
      />
      {routines.length === 0 && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('routines.empty')}
        </Typography>
      )}
      <Stack gap={0.75}>
        {routines.map(routine => (
          <Box
            key={routine.id}
            sx={{ alignItems: 'center', display: 'flex', gap: 1 }}
          >
            <FormatListNumberedRounded sx={{ color: HOPLA.green }} />
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography level='body-md' noWrap>
                {routine.name}
              </Typography>
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {routine.choreIds
                  .filter(id => known.has(id))
                  .map(id => names.get(id))
                  .join(' → ')}
              </Typography>
            </Stack>
            {routine.bonus > 0 && (
              <Chip size='sm' variant='soft' color='success'>
                {t('goals.reward', { count: routine.bonus })}
              </Chip>
            )}
            <IconButton
              size='sm'
              aria-label={t('routines.edit')}
              onClick={() => setDraft(draftFromRoutine(routine, known))}
            >
              <EditRounded />
            </IconButton>
            <IconButton
              size='sm'
              color='danger'
              aria-label={t('presets.delete')}
              onClick={() =>
                askDelete(
                  t('routines.deleteTitle'),
                  t('routines.deleteMessage', { name: routine.name }),
                  async () => {
                    await DeleteRoutine(routine.id)
                    refresh()
                  },
                )
              }
            >
              <DeleteOutlineRounded />
            </IconButton>
          </Box>
        ))}
      </Stack>
      {runs.length > 0 && (
        <LiveRoutines members={members} runs={runs} onSkip={skip} />
      )}
      {modal}
    </Sheet>
  )
}
