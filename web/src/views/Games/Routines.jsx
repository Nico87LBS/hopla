import {
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  CloseRounded,
  DeleteOutlineRounded,
  EditRounded,
  FormatListNumberedRounded,
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
  Typography,
} from '@mui/joy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useChores } from '../../queries/ChoreQueries'
import { useNotification } from '../../service/NotificationProvider'
import { DeleteRoutine, GetRoutines, SaveRoutine } from '../../utils/Fetcher'
import { moveStep, routineTasks } from '../../utils/routines'
import { surfaceSx } from './GameParts'
import { CardHeader, sendOrWarn, useConfirmDelete } from './Progression'

const MAX_STEPS = 20

const emptyRoutine = () => ({
  name: '',
  bonus: 5,
  validityMinutes: 720,
  choreIds: [],
  dependencies: [],
  optionalChoreIds: [],
})

const remapDependencies = (draft, choreIds) => {
  const positions = new Map(choreIds.map((id, index) => [id, index + 1]))
  const oldPositions = new Map(
    draft.choreIds.map((id, index) => [index + 1, id]),
  )
  return (draft.dependencies || [])
    .filter(
      edge =>
        oldPositions.has(edge.stepId) && oldPositions.has(edge.dependsOnStepId),
    )
    .filter(
      edge =>
        positions.has(oldPositions.get(edge.stepId)) &&
        positions.has(oldPositions.get(edge.dependsOnStepId)),
    )
    .map(edge => ({
      stepId: positions.get(oldPositions.get(edge.stepId)),
      dependsOnStepId: positions.get(oldPositions.get(edge.dependsOnStepId)),
    }))
}

const moveRoutineStep = (draft, index, delta) => {
  const choreIds = moveStep(draft.choreIds, index, delta)
  return {
    ...draft,
    choreIds,
    dependencies: remapDependencies(draft, choreIds),
  }
}

const removeRoutineStep = (draft, id) => {
  const choreIds = draft.choreIds.filter(other => other !== id)
  return {
    ...draft,
    choreIds,
    dependencies: remapDependencies(draft, choreIds),
    optionalChoreIds: (draft.optionalChoreIds || []).filter(
      other => other !== id,
    ),
  }
}

// The routines parents chain from tasks: each child sees one step at a time
// and earns the bonus once all of their steps of the day are done.
export const RoutinesCard = () => {
  const { t } = useTranslation('games')
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const { data: choresData } = useChores()
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
  // A step whose task was deleted is left out.
  const known = ids => ids.filter(id => names.has(id))
  const offered = draft
    ? routineTasks(chores, routines, draft.id).filter(
        chore => !draft.choreIds.includes(chore.id),
      )
    : []

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['games'] })
  const save = async () => {
    const resp = await SaveRoutine({
      id: draft.id,
      name: draft.name.trim(),
      bonus: Number(draft.bonus) || 0,
      validityMinutes: Number(draft.validityMinutes) || 720,
      choreIds: draft.choreIds,
      dependencies: draft.dependencies || [],
      optionalChoreIds: draft.optionalChoreIds || [],
    })
    if (await sendOrWarn(resp, showNotification, t('routines.failed'))) {
      setDraft(null)
      refresh()
    }
  }
  const setSteps = choreIds => setDraft({ ...draft, choreIds })
  const setPrerequisites = (position, prerequisites) => {
    const dependencies = (draft.dependencies || []).filter(
      edge => edge.stepId !== position,
    )
    prerequisites.forEach(dependsOnStepId =>
      dependencies.push({ stepId: position, dependsOnStepId }),
    )
    setDraft({ ...draft, dependencies })
  }

  return (
    <Sheet sx={surfaceSx}>
      <CardHeader
        title={t('routines.title')}
        subtitle={t('routines.subtitle')}
        onAdd={draft ? undefined : () => setDraft(emptyRoutine())}
      />
      {draft && (
        <Stack gap={1} sx={{ mb: 1.5 }}>
          <Input
            size='sm'
            autoFocus
            placeholder={t('routines.name')}
            value={draft.name}
            onChange={event => setDraft({ ...draft, name: event.target.value })}
            slotProps={{ input: { maxLength: 60 } }}
          />
          <Stack gap={0.5}>
            {draft.choreIds.map((id, index) => (
              <Box
                key={id}
                sx={{
                  alignItems: 'center',
                  bgcolor: 'background.level1',
                  borderRadius: 'md',
                  display: 'flex',
                  gap: 1,
                  pl: 1.25,
                  pr: 0.5,
                  py: 0.25,
                }}
              >
                <Typography
                  level='title-sm'
                  sx={{ color: HOPLA.greenText, minWidth: 18 }}
                >
                  {index + 1}
                </Typography>
                <Typography
                  level='body-sm'
                  sx={{ flex: 1, minWidth: 0 }}
                  noWrap
                >
                  {names.get(id)}
                </Typography>
                <IconButton
                  size='sm'
                  disabled={index === 0}
                  aria-label={t('routines.up')}
                  onClick={() => setDraft(moveRoutineStep(draft, index, -1))}
                >
                  <ArrowUpwardRounded />
                </IconButton>
                <IconButton
                  size='sm'
                  disabled={index === draft.choreIds.length - 1}
                  aria-label={t('routines.down')}
                  onClick={() => setDraft(moveRoutineStep(draft, index, 1))}
                >
                  <ArrowDownwardRounded />
                </IconButton>
                <IconButton
                  size='sm'
                  aria-label={t('routines.remove')}
                  onClick={() => setDraft(removeRoutineStep(draft, id))}
                >
                  <CloseRounded />
                </IconButton>
                <Select
                  size='sm'
                  multiple
                  value={(draft.dependencies || [])
                    .filter(edge => edge.stepId === index + 1)
                    .map(edge => edge.dependsOnStepId)}
                  placeholder={t('routines.addTask')}
                  onChange={(event, value) =>
                    setPrerequisites(index + 1, value)
                  }
                  sx={{ minWidth: 130, maxWidth: 200 }}
                >
                  {draft.choreIds.map((otherId, otherIndex) =>
                    otherId === id ? null : (
                      <Option key={otherId} value={otherIndex + 1}>
                        {names.get(otherId)}
                      </Option>
                    ),
                  )}
                </Select>
                <Chip
                  size='sm'
                  variant={
                    (draft.optionalChoreIds || []).includes(id)
                      ? 'solid'
                      : 'outlined'
                  }
                  color={
                    (draft.optionalChoreIds || []).includes(id)
                      ? 'warning'
                      : 'neutral'
                  }
                  onClick={() =>
                    setDraft({
                      ...draft,
                      optionalChoreIds: (draft.optionalChoreIds || []).includes(
                        id,
                      )
                        ? draft.optionalChoreIds.filter(other => other !== id)
                        : [...(draft.optionalChoreIds || []), id],
                    })
                  }
                >
                  {t('routines.optional', { defaultValue: 'Facultative' })}
                </Chip>
              </Box>
            ))}
          </Stack>
          {draft.choreIds.length < MAX_STEPS && (
            <Select
              size='sm'
              value={null}
              placeholder={
                offered.length ? t('routines.addTask') : t('routines.noTask')
              }
              disabled={offered.length === 0}
              onChange={(event, value) =>
                value && setSteps([...draft.choreIds, value])
              }
            >
              {offered.map(chore => (
                <Option key={chore.id} value={chore.id}>
                  {chore.name}
                </Option>
              ))}
            </Select>
          )}
          <Input
            size='sm'
            type='number'
            value={draft.bonus}
            onChange={event =>
              setDraft({ ...draft, bonus: event.target.value })
            }
            startDecorator={t('routines.bonus')}
            slotProps={{ input: { min: 0, max: 1000 } }}
            sx={{ alignSelf: 'flex-start', maxWidth: 260 }}
          />
          <Input
            size='sm'
            type='number'
            value={draft.validityMinutes ?? 720}
            onChange={event =>
              setDraft({ ...draft, validityMinutes: event.target.value })
            }
            startDecorator={t('routines.validity')}
            slotProps={{ input: { min: 1, max: 2880 } }}
            sx={{ alignSelf: 'flex-start', maxWidth: 300 }}
          />
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
            {t('routines.help')}
            {t('routines.validityHelp')}
            {t('routines.validityHelp')}
          </Typography>
          <Stack direction='row' gap={1}>
            <Button
              size='sm'
              disabled={!draft.name.trim() || draft.choreIds.length === 0}
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
      {routines.length === 0 && !draft && (
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
                {known(routine.choreIds)
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
              onClick={() =>
                setDraft({
                  ...routine,
                  choreIds: known(routine.choreIds),
                  dependencies: routine.dependencies || [],
                  optionalChoreIds: routine.optionalChoreIds || [],
                })
              }
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
      {modal}
    </Sheet>
  )
}
