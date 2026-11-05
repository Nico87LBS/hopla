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
  Switch,
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
  optionalStepIds: [],
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
  optionalStepIds: remapAfterMove(
    (draft.optionalStepIds || []).map(stepId => ({
      stepId,
      dependsOnStepId: stepId,
    })),
    index,
    delta,
  ).map(edge => edge.stepId),
})

const removeRoutineStep = (draft, index) => {
  const choreIds = draft.choreIds.filter((_, position) => position !== index)
  const slotIds = (draft.slotIds || []).filter(
    (_, position) => position !== index,
  )
  const removedPosition = index + 1
  const remapPosition = position =>
    position > removedPosition ? position - 1 : position
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
    optionalStepIds: (draft.optionalStepIds || [])
      .filter(stepId => stepId !== removedPosition)
      .map(stepId => (stepId > removedPosition ? stepId - 1 : stepId)),
  }
}

// The routines parents chain from tasks: each child sees one step at a time
// and earns the bonus once all of their steps of the day are done.
export const RoutinesCard = () => {
  const { t } = useTranslation('games')
  const { showError, showNotification } = useNotification()
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
  const [expandedStep, setExpandedStep] = useState(0)
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
      .map(progress => ({
        routine,
        progress,
        occurrence: progress.occurrence,
      })),
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
      optionalStepIds: draft.optionalStepIds || [],
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
      dependencies: [
        ...(draft.dependencies || []),
        ...(draft.choreIds.length > 0
          ? [
              {
                stepId: draft.choreIds.length + 1,
                dependsOnStepId: draft.choreIds.length,
              },
            ]
          : []),
      ],
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
        onAdd={
          draft
            ? undefined
            : () => {
                setExpandedStep(0)
                setDraft(emptyRoutine())
              }
        }
      />
      {draft && (
        <Stack gap={1.5} sx={{ mb: 2 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            gap={1.5}
            alignItems={{ md: 'flex-end' }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography level='body-sm' fontWeight='lg' sx={{ mb: 0.5 }}>
                {t('routines.name')}
              </Typography>
              <Input
                size='lg'
                autoFocus
                placeholder={t('routines.name')}
                value={draft.name}
                onChange={event =>
                  setDraft({ ...draft, name: event.target.value })
                }
                slotProps={{ input: { maxLength: 60 } }}
                sx={{ bgcolor: 'background.surface' }}
              />
            </Box>
            <Box sx={{ width: { xs: '100%', md: 230 } }}>
              <Typography level='body-sm' fontWeight='lg' sx={{ mb: 0.5 }}>
                {t('routines.validity')}
              </Typography>
              <Input
                size='lg'
                type='number'
                value={draft.validityMinutes ?? 720}
                onChange={event =>
                  setDraft({ ...draft, validityMinutes: event.target.value })
                }
                endDecorator='min'
                slotProps={{ input: { min: 1, max: 2880 } }}
                sx={{ bgcolor: 'background.surface' }}
              />
            </Box>
          </Stack>

          <Sheet
            variant='outlined'
            sx={{
              p: { xs: 1, sm: 1.5 },
              borderRadius: 'lg',
              borderColor: 'divider',
              bgcolor: 'background.surface',
            }}
          >
            <Stack
              direction='row'
              alignItems='center'
              justifyContent='space-between'
              sx={{ mb: 1 }}
            >
              <Typography level='title-md'>
                {t('routines.stepsTitle', {
                  defaultValue: 'Les étapes de votre routine',
                })}
              </Typography>
              <Chip size='sm' variant='soft' color='primary'>
                {draft.choreIds.length}/{MAX_STEPS}
              </Chip>
            </Stack>

            <Stack gap={0.75}>
              {draft.choreIds.map((id, index) => {
                const chore = chores.find(item => item.id === id)
                const slots = chore?.frequencyMetadata?.slots || []
                const optional = (draft.optionalStepIds || []).includes(
                  index + 1,
                )
                const expanded = expandedStep === index
                const prerequisites = (draft.dependencies || [])
                  .filter(edge => edge.stepId === index + 1)
                  .map(edge => edge.dependsOnStepId)

                return (
                  <Sheet
                    key={`${id}-${index}`}
                    variant='outlined'
                    sx={{
                      overflow: 'hidden',
                      borderRadius: 'md',
                      borderColor: expanded ? 'primary.400' : 'divider',
                      bgcolor: expanded
                        ? 'background.level1'
                        : 'background.surface',
                    }}
                  >
                    <Stack
                      direction='row'
                      alignItems='center'
                      gap={{ xs: 0.5, sm: 1 }}
                      sx={{ px: { xs: 0.75, sm: 1 }, py: 1, cursor: 'pointer' }}
                      onClick={() => setExpandedStep(expanded ? -1 : index)}
                    >
                      <Stack gap={0} onClick={event => event.stopPropagation()}>
                        <IconButton
                          size='sm'
                          variant='plain'
                          disabled={index === 0}
                          aria-label={t('routines.up')}
                          onClick={() => {
                            setDraft(moveRoutineStep(draft, index, -1))
                            setExpandedStep(index - 1)
                          }}
                        >
                          <ArrowUpwardRounded />
                        </IconButton>
                        <IconButton
                          size='sm'
                          variant='plain'
                          disabled={index === draft.choreIds.length - 1}
                          aria-label={t('routines.down')}
                          onClick={() => {
                            setDraft(moveRoutineStep(draft, index, 1))
                            setExpandedStep(index + 1)
                          }}
                        >
                          <ArrowDownwardRounded />
                        </IconButton>
                      </Stack>
                      <Typography
                        level='title-sm'
                        sx={{
                          bgcolor: 'primary.softBg',
                          color: 'primary.700',
                          borderRadius: '50%',
                          width: 30,
                          height: 30,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level='title-sm' noWrap>
                          {names.get(id)}
                        </Typography>
                        <Typography
                          level='body-xs'
                          sx={{ color: 'text.tertiary' }}
                        >
                          {slots.length > 0
                            ? slots.find(
                                slot =>
                                  slot.id === (draft.slotIds?.[index] || ''),
                              )?.name ||
                              slots.find(
                                slot =>
                                  slot.id === (draft.slotIds?.[index] || ''),
                              )?.time ||
                              t('routines.selectSlot')
                            : t('routines.stepSubtitle', {
                                defaultValue: 'Étape de la routine',
                              })}
                        </Typography>
                      </Box>
                      <Stack
                        direction='row'
                        alignItems='center'
                        gap={0.5}
                        onClick={event => event.stopPropagation()}
                      >
                        <Switch
                          size='md'
                          checked={!optional}
                          onChange={event =>
                            setDraft({
                              ...draft,
                              optionalStepIds: event.target.checked
                                ? (draft.optionalStepIds || []).filter(
                                    stepId => stepId !== index + 1,
                                  )
                                : [...(draft.optionalStepIds || []), index + 1],
                            })
                          }
                          slotProps={{
                            input: {
                              'aria-label': optional
                                ? t('routines.makeRequired', {
                                    defaultValue: 'Rendre obligatoire',
                                  })
                                : t('routines.makeOptional', {
                                    defaultValue: 'Rendre facultative',
                                  }),
                            },
                          }}
                        />
                        <Typography
                          level='body-xs'
                          sx={{
                            display: { xs: 'none', sm: 'block' },
                            minWidth: 76,
                          }}
                        >
                          {optional
                            ? t('routines.optional', {
                                defaultValue: 'Facultative',
                              })
                            : t('routines.required', {
                                defaultValue: 'Obligatoire',
                              })}
                        </Typography>
                      </Stack>
                      <IconButton
                        size='sm'
                        color='danger'
                        variant='plain'
                        aria-label={t('routines.remove')}
                        onClick={event => {
                          event.stopPropagation()
                          setDraft(removeRoutineStep(draft, index))
                          setExpandedStep(-1)
                        }}
                      >
                        <CloseRounded />
                      </IconButton>
                      <Typography sx={{ color: 'text.tertiary', px: 0.25 }}>
                        {expanded ? '⌃' : '⌄'}
                      </Typography>
                    </Stack>

                    {expanded && (
                      <Box
                        sx={{
                          borderTop: '1px solid',
                          borderColor: 'divider',
                          px: { xs: 1, sm: 2 },
                          py: 1.5,
                        }}
                        onClick={event => event.stopPropagation()}
                      >
                        <Typography level='title-sm' sx={{ mb: 1 }}>
                          {t('routines.advancedSettings', {
                            defaultValue: 'Réglages avancés',
                          })}
                        </Typography>
                        <Stack
                          direction={{ xs: 'column', md: 'row' }}
                          gap={1.5}
                          alignItems='flex-start'
                        >
                          {slots.length > 0 && (
                            <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                              <Typography
                                level='body-xs'
                                fontWeight='lg'
                                sx={{ mb: 0.5 }}
                              >
                                {t('routines.selectSlot')}
                              </Typography>
                              <Select
                                size='md'
                                value={draft.slotIds?.[index] || ''}
                                placeholder={t('routines.selectSlot')}
                                onChange={(event, value) => {
                                  const slotIds = [
                                    ...(draft.slotIds ||
                                      draft.choreIds.map(() => '')),
                                  ]
                                  slotIds[index] = value || ''
                                  setDraft({ ...draft, slotIds })
                                }}
                              >
                                {(() => {
                                  const options = routineTasks(
                                    chores,
                                    routines,
                                    draft.id,
                                  ).find(item => item.id === id)
                                  const currentSlotId =
                                    draft.slotIds?.[index] || ''
                                  const availableSlots = (
                                    options?.routineAvailableSlots || []
                                  ).filter(
                                    slot =>
                                      slot.id === currentSlotId ||
                                      !(draft.slotIds || []).some(
                                        (slotId, otherIndex) =>
                                          otherIndex !== index &&
                                          draft.choreIds[otherIndex] === id &&
                                          slotId === slot.id,
                                      ),
                                  )
                                  return (
                                    <>
                                      {options?.routineCanUseAllSlots && (
                                        <Option value=''>
                                          {t('routines.allSlots')}
                                        </Option>
                                      )}
                                      {availableSlots.map(slot => (
                                        <Option key={slot.id} value={slot.id}>
                                          {slot.name || slot.time} · {slot.time}
                                        </Option>
                                      ))}
                                      {currentSlotId &&
                                        !availableSlots.some(
                                          slot =>
                                            slot.id === currentSlotId,
                                        ) && (
                                          <Option value={currentSlotId}>
                                            {t('routines.missingSlot')}
                                          </Option>
                                        )}
                                    </>
                                  )
                                })()}
                              </Select>
                            </Box>
                          )}
                          <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                            <Typography
                              level='body-xs'
                              fontWeight='lg'
                              sx={{ mb: 0.5 }}
                            >
                              {t('routines.prerequisites', {
                                defaultValue: 'Prérequis',
                              })}
                            </Typography>
                            <Select
                              size='md'
                              multiple
                              value={prerequisites}
                              placeholder={t('routines.noPrerequisite', {
                                defaultValue: 'Aucun prérequis',
                              })}
                              onChange={(event, value) =>
                                setPrerequisites(index + 1, value)
                              }
                            >
                              {draft.choreIds.map((otherId, otherIndex) =>
                                otherIndex === index ? null : (
                                  <Option
                                    key={`${otherId}-${otherIndex}`}
                                    value={otherIndex + 1}
                                  >
                                    {names.get(otherId)}
                                  </Option>
                                ),
                              )}
                            </Select>
                          </Box>
                        </Stack>
                        <Typography
                          level='body-xs'
                          sx={{ color: 'text.tertiary', mt: 1 }}
                        >
                          {optional
                            ? t('routines.optionalHelp', {
                                defaultValue:
                                  'Cette étape peut être ignorée sans bloquer la réussite de la routine.',
                              })
                            : t('routines.requiredHelp', {
                                defaultValue:
                                  'Cette étape doit être terminée pour valider la routine.',
                              })}
                        </Typography>
                      </Box>
                    )}
                  </Sheet>
                )
              })}
            </Stack>

            {draft.choreIds.length < MAX_STEPS && (
              <Select
                size='lg'
                value={null}
                placeholder={
                  offered.length ? t('routines.addTask') : t('routines.noTask')
                }
                disabled={offered.length === 0}
                onChange={(event, value) => {
                  if (!value) return
                  const [id, slotId] = value.split('::')
                  setSteps(Number(id), slotId)
                  setExpandedStep(draft.choreIds.length)
                }}
                sx={{ mt: 1, maxWidth: { xs: '100%', sm: 320 } }}
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
                      <Option
                        key={`${chore.id}-${slot.id}`}
                        value={`${chore.id}::${slot.id}`}
                      >
                        {chore.name} · {slot.name || slot.time}
                      </Option>,
                    ),
                  )
                  return options
                })}
              </Select>
            )}
          </Sheet>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            gap={1.5}
            alignItems={{ sm: 'flex-end' }}
          >
            <Box sx={{ width: { xs: '100%', sm: 220 } }}>
              <Typography level='body-sm' fontWeight='lg' sx={{ mb: 0.5 }}>
                {t('routines.bonus')}
              </Typography>
              <Input
                size='lg'
                type='number'
                value={draft.bonus}
                onChange={event =>
                  setDraft({ ...draft, bonus: event.target.value })
                }
                slotProps={{ input: { min: 0, max: 1000 } }}
              />
            </Box>
            <Typography
              level='body-xs'
              sx={{ color: 'text.tertiary', flex: 1 }}
            >
              {t('routines.help')} {t('routines.validityHelp')}
            </Typography>
          </Stack>

          <Stack direction='row' gap={1} justifyContent='flex-end'>
            <Button
              size='lg'
              variant='outlined'
              color='neutral'
              onClick={() => setDraft(null)}
            >
              {t('presets.cancel')}
            </Button>
            <Button
              size='lg'
              disabled={!draft.name.trim() || draft.choreIds.length === 0}
              onClick={save}
            >
              {t('presets.save')}
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
              onClick={() => {
                setExpandedStep(0)
                setDraft({
                  ...routine,
                  choreIds: known(routine.choreIds),
                  slotIds: routine.slotIds || routine.choreIds.map(() => ''),
                  dependencies: routine.dependencies || [],
                  optionalStepIds:
                    routine.optionalStepIds ||
                    (routine.optionalChoreIds || []).flatMap(id =>
                      routine.choreIds.flatMap((choreId, index) =>
                        choreId === id ? [index + 1] : [],
                      ),
                    ),
                })
              }}
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
        <Stack
          gap={1}
          sx={{
            mt: 2,
            pt: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography level='title-sm'>{t('routines.liveTitle')}</Typography>
          {liveOccurrences.map(({ occurrence, progress, routine }) => (
            <Box
              key={occurrence.id}
              sx={{ bgcolor: 'background.level1', borderRadius: 'md', p: 1 }}
            >
              <Stack
                direction='row'
                alignItems='center'
                justifyContent='space-between'
              >
                <Typography level='body-sm' fontWeight='lg'>
                  {routine.name}
                  {' · '}
                  {t('routines.memberNumber', { id: progress.userId })}
                </Typography>
                <Chip
                  size='sm'
                  color={
                    occurrence.status === 'finished' ? 'success' : 'primary'
                  }
                >
                  {t(`routines.occurrenceStatus.${occurrence.status}`)}
                </Chip>
              </Stack>
              <Typography
                level='body-xs'
                sx={{ color: 'text.tertiary', mb: 0.75 }}
              >
                {t('routines.expiresAt', {
                  time: new Date(occurrence.expiresAt).toLocaleString(),
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
                      {!item.required ? ` · ${t('routines.optional')}` : ''}
                    </Typography>
                    {item.status === 'pending' && item.available && (
                      <Button
                        size='sm'
                        variant='soft'
                        color='neutral'
                        onClick={() =>
                          skipOccurrenceItem(occurrence.id, item.id)
                        }
                      >
                        {t('routines.skip')}
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
