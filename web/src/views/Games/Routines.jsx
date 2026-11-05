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
import { useChores, useRoutinesToday } from '../../queries/ChoreQueries'
import { useNotification } from '../../service/NotificationProvider'
import {
  DeleteRoutine,
  GetRoutines,
  SaveRoutine,
  SkipRoutineOccurrenceItem,
} from '../../utils/Fetcher'
import { moveStep, routineTasks } from '../../utils/routines'
import { surfaceSx } from './GameParts'
import { CardHeader, sendOrWarn, useConfirmDelete } from './Progression'

const MAX_STEPS = 20

const emptyRoutine = () => ({
  name: '',
  bonus: 5,
  validityMinutes: 720,
  choreIds: [],
  slotIds: [],
  dependencies: [],
  optionalChoreIds: [],
})

const remapAfterMove = (dependencies, index, delta) => {
  const movedTo = index + delta
  const movePosition = position => {
    const oldIndex = position - 1
    if (oldIndex === index) return movedTo + 1
    if (oldIndex === movedTo) return index + 1
    return position
  }
  return (dependencies || []).map(edge => ({
    stepId: movePosition(edge.stepId),
    dependsOnStepId: movePosition(edge.dependsOnStepId),
  }))
}

const moveRoutineStep = (draft, index, delta) => ({
  ...draft,
  choreIds: moveStep(draft.choreIds, index, delta),
  slotIds: moveStep(
    draft.slotIds || draft.choreIds.map(() => ''),
    index,
    delta,
  ),
  dependencies: remapAfterMove(draft.dependencies, index, delta),
})

const removeRoutineStep = (draft, index) => {
  const choreIds = draft.choreIds.filter((_, position) => position !== index)
  const slotIds = (draft.slotIds || []).filter(
    (_, position) => position !== index,
  )
  const removedPosition = index + 1
  const remapPosition = position =>
    position > removedPosition ? position - 1 : position
  const removedChoreID = draft.choreIds[index]
  return {
    ...draft,
    choreIds,
    slotIds,
    dependencies: (draft.dependencies || [])
      .filter(
        edge =>
          edge.stepId !== removedPosition &&
          edge.dependsOnStepId !== removedPosition,
      )
      .map(edge => ({
        stepId: remapPosition(edge.stepId),
        dependsOnStepId: remapPosition(edge.dependsOnStepId),
      })),
    optionalChoreIds: (draft.optionalChoreIds || []).filter(
      id => id !== removedChoreID || choreIds.includes(id),
    ),
  }
}

// The routines parents chain from tasks: each child sees one step at a time
// and earns the bonus once all of their steps of the day are done.
export const RoutinesCard = () => {
  const { t } = useTranslation('games')
  const { showNotification, showError } = useNotification()
  const queryClient = useQueryClient()
  const { data: choresData } = useChores()
  const { data: todayRoutines = [] } = useRoutinesToday()
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
    ? routineTasks(chores, routines, draft.id)
        .map(chore => {
          const selected = draft.choreIds
            .map((id, index) => (id === chore.id ? index : -1))
            .filter(index => index !== -1)
          const slots = chore.frequencyMetadata?.slots || []
          if (slots.length === 0) return selected.length === 0 ? chore : null
          const selectedSlots = selected.map(
            index => draft.slotIds?.[index] || '',
          )
          if (selectedSlots.includes('')) return null
          const availableSlots = (chore.routineAvailableSlots || []).filter(
            slot => !selectedSlots.includes(slot.id),
          )
          if (availableSlots.length === 0) return null
          return {
            ...chore,
            routineAvailableSlots: availableSlots,
            routineCanUseAllSlots:
              selected.length === 0 && chore.routineCanUseAllSlots,
          }
        })
        .filter(Boolean)
    : []
  const liveOccurrences = todayRoutines.flatMap(routine =>
    (routine.members || [])
      .filter(progress => progress.occurrence)
      .map(progress => ({ routine, progress, occurrence: progress.occurrence })),
  )

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['games'] })
  const skipOccurrenceItem = async (occurrenceId, itemId) => {
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
      optionalChoreIds: draft.optionalChoreIds || [],
    })
    if (await sendOrWarn(resp, showNotification, t('routines.failed'))) {
      setDraft(null)
      refresh()
    }
  }
  const setSteps = (choreId, slotId = '') => {
    setDraft({
      ...draft,
      choreIds: [...draft.choreIds, choreId],
      slotIds: [...(draft.slotIds || draft.choreIds.map(() => '')), slotId],
    })
  }
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
                key={`${id}-${index}`}
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
                  onClick={() => setDraft(removeRoutineStep(draft, index))}
                >
                  <CloseRounded />
                </IconButton>
                {(
                  chores.find(chore => chore.id === id)?.frequencyMetadata
                    ?.slots || []
                ).length > 0 && (
                  <Select
                    size='sm'
                    value={draft.slotIds?.[index] || ''}
                    placeholder={t('routines.selectSlot')}
                    onChange={(event, value) => {
                      const slotIds = [
                        ...(draft.slotIds || draft.choreIds.map(() => '')),
                      ]
                      slotIds[index] = value || ''
                      setDraft({ ...draft, slotIds })
                    }}
                    sx={{ minWidth: 130, maxWidth: 190 }}
                  >
                    {(() => {
                      const options = routineTasks(
                        chores,
                        routines,
                        draft.id,
                      ).find(chore => chore.id === id)
                      const currentSlotId = draft.slotIds?.[index] || ''
                      const availableSlots = (options?.routineAvailableSlots || []).filter(
                        slot =>
                          slot.id === currentSlotId ||
                          !(draft.slotIds || []).some(
                            (slotId, otherIndex) =>
                              otherIndex !== index &&
                              draft.choreIds[otherIndex] === id &&
                              slotId === slot.id,
                          ),
                      )
                      const canUseAllSlots =
                        options?.routineCanUseAllSlots &&
                        !(draft.choreIds || []).some(
                          (otherId, otherIndex) => otherIndex !== index && otherId === id,
                        )
                      return (
                        <>
                          {canUseAllSlots && (
                            <Option value=''>{t('routines.allSlots')}</Option>
                          )}
                          {availableSlots.map(slot => (
                            <Option key={slot.id} value={slot.id}>
                              {slot.name || slot.time} · {slot.time}
                            </Option>
                          ))}
                          {currentSlotId &&
                            !(options?.routineAvailableSlots || []).some(
                              slot => slot.id === currentSlotId,
                            ) && (
                              <Option value={currentSlotId}>
                                {t('routines.missingSlot')}
                              </Option>
                            )}
                        </>
                      )
                    })()}
                  </Select>
                )}
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
              onChange={(event, value) => {
                if (!value) return
                const [id, slotId] = value.split('::')
                setSteps(Number(id), slotId)
              }}
            >
              {offered.flatMap(chore => {
                const slots = chore.routineAvailableSlots || []
                const options = []
                if (chore.routineCanUseAllSlots) {
                  options.push(
                    <Option key={`${chore.id}-all`} value={`${chore.id}::`}>
                      {chore.name} · {t('routines.allSlots')}
                    </Option>,
                  )
                }
                if (slots.length === 0 && options.length === 0) {
                  options.push(
                    <Option key={chore.id} value={`${chore.id}::`}>
                      {chore.name}
                    </Option>,
                  )
                }
                slots.forEach(slot =>
                  options.push(
                    <Option key={`${chore.id}-${slot.id}`} value={`${chore.id}::${slot.id}`}>
                      {chore.name} · {slot.name || slot.time}
                    </Option>,
                  ),
                )
                return options
              })}
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
                  slotIds: routine.slotIds || routine.choreIds.map(() => ''),
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
      {liveOccurrences.length > 0 && (
        <Stack gap={1} sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography level='title-sm'>
            {t('routines.liveTitle', { defaultValue: 'Suivi des occurrences en cours' })}
          </Typography>
          {liveOccurrences.map(({ routine, progress, occurrence }) => (
            <Box
              key={occurrence.id}
              sx={{ bgcolor: 'background.level1', borderRadius: 'md', p: 1 }}
            >
              <Stack direction='row' alignItems='center' justifyContent='space-between'>
                <Typography level='body-sm' fontWeight='lg'>
                  {routine.name} · {t('routines.memberNumber', {
                    id: progress.userId,
                    defaultValue: `Membre ${progress.userId}`,
                  })}
                </Typography>
                <Chip size='sm' color={occurrence.status === 'finished' ? 'success' : 'primary'}>
                  {occurrence.status}
                </Chip>
              </Stack>
              <Typography level='body-xs' sx={{ color: 'text.tertiary', mb: 0.75 }}>
                {t('routines.expiresAt', {
                  time: new Date(occurrence.expiresAt).toLocaleString(),
                  defaultValue: `Expire le ${new Date(occurrence.expiresAt).toLocaleString()}`,
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
                      {item.choreName} · {t(`routines.itemStatus.${item.status}`, {
                        defaultValue: item.status,
                      })}
                      {!item.required ? ` · ${t('routines.optional', { defaultValue: 'Facultative' })}` : ''}
                    </Typography>
                    {item.status === 'pending' && item.available && (
                      <Button
                        size='sm'
                        variant='soft'
                        color='neutral'
                        onClick={() => skipOccurrenceItem(occurrence.id, item.id)}
                      >
                        {t('routines.skip', { defaultValue: 'Ignorer' })}
                      </Button>
                    )}
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
      {modal}
    </Sheet>
  )
}
