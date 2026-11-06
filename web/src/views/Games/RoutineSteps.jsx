import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AddRounded,
  CloseRounded,
  DragIndicatorRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ModalActions from '../../components/common/ModalActions'
import { HOPLA } from '../../constants/theme'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import {
  addSteps,
  draftOrderMode,
  loopingPrerequisites,
  MAX_ROUTINE_STEPS,
  moveStepTo,
  removeStepAt,
  routineTasks,
  setPrerequisites,
} from '../../utils/routines'

const stepKey = (draft, index) =>
  `${draft.choreIds[index]}::${draft.slotIds?.[index] || ''}`

const slotLabel = slot =>
  slot.name ? `${slot.name} · ${slot.time}` : slot.time

const StepRow = ({ chore, draft, id, index, names, setDraft }) => {
  const { t } = useTranslation('games')
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id })
  const position = index + 1
  const optional = (draft.optionalStepIds || []).includes(position)
  const custom = draftOrderMode(draft) === 'custom'
  const slot = (chore?.frequencyMetadata?.slots || []).find(
    item => item.id === (draft.slotIds?.[index] || ''),
  )
  const looping = loopingPrerequisites(draft.dependencies, position)
  const prerequisites = (draft.dependencies || [])
    .filter(edge => edge.stepId === position)
    .map(edge => edge.dependsOnStepId)
  return (
    <Sheet
      ref={setNodeRef}
      variant='outlined'
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ borderRadius: 'md', p: 1, bgcolor: 'background.surface' }}
    >
      <Stack direction='row' alignItems='center' gap={1}>
        <IconButton
          size='sm'
          variant='plain'
          color='neutral'
          aria-label={t('routines.drag')}
          sx={{ cursor: 'grab', touchAction: 'none' }}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorRounded />
        </IconButton>
        <Typography
          level='title-sm'
          sx={{
            alignItems: 'center',
            bgcolor: HOPLA.violetSoft,
            borderRadius: '50%',
            color: HOPLA.violet,
            display: 'grid',
            flexShrink: 0,
            height: 28,
            placeItems: 'center',
            width: 28,
          }}
        >
          {position}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-sm'>
            {names.get(draft.choreIds[index])}
            {slot && (
              <Chip size='sm' variant='soft' color='primary' sx={{ ml: 0.75 }}>
                {slotLabel(slot)}
              </Chip>
            )}
          </Typography>
        </Box>
        <Chip
          size='sm'
          variant={optional ? 'outlined' : 'soft'}
          color={optional ? 'neutral' : 'success'}
          onClick={() =>
            setDraft({
              ...draft,
              optionalStepIds: optional
                ? draft.optionalStepIds.filter(other => other !== position)
                : [...(draft.optionalStepIds || []), position],
            })
          }
          slotProps={{ action: { 'aria-pressed': optional } }}
        >
          {optional ? t('routines.optional') : t('routines.required')}
        </Chip>
        <IconButton
          size='sm'
          color='danger'
          variant='plain'
          aria-label={t('routines.remove')}
          onClick={() => setDraft(removeStepAt(draft, index))}
        >
          <CloseRounded />
        </IconButton>
      </Stack>
      {custom && (
        <Box sx={{ mt: 1, pl: { xs: 0, sm: 5 } }}>
          <Typography level='body-xs' fontWeight='lg' sx={{ mb: 0.5 }}>
            {t('routines.opensAfter')}
          </Typography>
          <Stack direction='row' gap={0.75} flexWrap='wrap'>
            <Chip
              size='sm'
              variant={prerequisites.length === 0 ? 'solid' : 'outlined'}
              color='primary'
              onClick={() => setDraft(setPrerequisites(draft, position, []))}
              slotProps={{
                action: { 'aria-pressed': prerequisites.length === 0 },
              }}
            >
              {t('routines.opensAtOnce')}
            </Chip>
            {draft.choreIds.map((otherId, otherIndex) => {
              const other = otherIndex + 1
              // Only the steps before, and a later one this step still waits for.
              if (
                otherIndex === index ||
                looping.has(other) ||
                (otherIndex > index && !prerequisites.includes(other))
              ) {
                return null
              }
              const on = prerequisites.includes(other)
              return (
                <Chip
                  key={`${other}-${stepKey(draft, otherIndex)}`}
                  size='sm'
                  variant={on ? 'solid' : 'outlined'}
                  color='primary'
                  onClick={() =>
                    setDraft(
                      setPrerequisites(
                        draft,
                        position,
                        on
                          ? prerequisites.filter(item => item !== other)
                          : [...prerequisites, other],
                      ),
                    )
                  }
                  slotProps={{ action: { 'aria-pressed': on } }}
                >
                  {other}. {names.get(otherId)}
                </Chip>
              )
            })}
          </Stack>
        </Box>
      )}
    </Sheet>
  )
}

StepRow.propTypes = {
  chore: PropTypes.object,
  draft: PropTypes.object.isRequired,
  id: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  names: PropTypes.instanceOf(Map).isRequired,
  setDraft: PropTypes.func.isRequired,
}

// The tasks that can still be added: with their slots when they have some.
const offeredTasks = (chores, routines, draft) =>
  routineTasks(chores, routines, draft.id)
    .map(chore => {
      const selected = draft.choreIds
        .map((id, index) => (id === chore.id ? index : -1))
        .filter(index => index !== -1)
      const slots = chore.frequencyMetadata?.slots || []
      if (slots.length === 0) return selected.length === 0 ? chore : null
      const used = selected.map(index => draft.slotIds?.[index] || '')
      if (used.includes('')) return null
      const free = (chore.routineAvailableSlots || []).filter(
        slot => !used.includes(slot.id),
      )
      if (free.length === 0) return null
      return {
        ...chore,
        routineAvailableSlots: free,
        routineCanUseAllSlots:
          selected.length === 0 && chore.routineCanUseAllSlots,
      }
    })
    .filter(Boolean)

// The sheet to add tasks: tick the ones wanted, and under a task with slots
// the slots, or all of them.
const AddTasksModal = ({ chores, draft, onAdd, onClose, routines }) => {
  const { t } = useTranslation('games')
  const { ResponsiveModal } = useResponsiveModal()
  const [picked, setPicked] = useState(() => new Set())
  const offered = useMemo(
    () => offeredTasks(chores, routines, draft),
    [chores, routines, draft],
  )
  const toggle = (key, others = []) =>
    setPicked(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else {
        others.forEach(other => next.delete(other))
        next.add(key)
      }
      return next
    })
  const room = MAX_ROUTINE_STEPS - draft.choreIds.length
  const add = () =>
    onAdd(
      [...picked].map(key => {
        const [choreId, slotId] = key.split('::')
        return { choreId: Number(choreId), slotId }
      }),
    )
  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={t('routines.addTasksTitle')}
      footer={
        <ModalActions
          secondary={{ label: t('presets.cancel'), onClick: onClose }}
          primary={{
            label: picked.size
              ? t('routines.addSteps', { count: picked.size })
              : t('routines.addNone'),
            onClick: add,
            disabled: picked.size === 0 || picked.size > room,
          }}
        />
      }
    >
      {offered.length === 0 ? (
        <Typography level='body-sm'>{t('routines.noTask')}</Typography>
      ) : (
        <Stack gap={1}>
          {offered.map(chore => {
            const slots = chore.routineAvailableSlots || []
            const allKey = `${chore.id}::`
            const slotKeys = slots.map(slot => `${chore.id}::${slot.id}`)
            const on = [allKey, ...slotKeys].some(key => picked.has(key))
            return (
              <Box key={chore.id}>
                <Checkbox
                  size='lg'
                  label={chore.name}
                  checked={on}
                  onChange={() => {
                    if (on) {
                      setPicked(current => {
                        const next = new Set(current)
                        ;[allKey, ...slotKeys].forEach(key => next.delete(key))
                        return next
                      })
                    } else {
                      toggle(
                        slots.length && !chore.routineCanUseAllSlots
                          ? slotKeys[0]
                          : allKey,
                      )
                    }
                  }}
                />
                {slots.length > 0 && on && (
                  <Stack
                    direction='row'
                    gap={0.75}
                    flexWrap='wrap'
                    sx={{ pl: 4, pt: 0.75 }}
                  >
                    {chore.routineCanUseAllSlots && (
                      <Chip
                        variant={picked.has(allKey) ? 'solid' : 'outlined'}
                        color='primary'
                        onClick={() => toggle(allKey, slotKeys)}
                      >
                        {t('routines.allSlots')}
                      </Chip>
                    )}
                    {slots.map(slot => {
                      const key = `${chore.id}::${slot.id}`
                      return (
                        <Chip
                          key={key}
                          variant={picked.has(key) ? 'solid' : 'outlined'}
                          color='primary'
                          onClick={() => toggle(key, [allKey])}
                        >
                          {slotLabel(slot)}
                        </Chip>
                      )
                    })}
                  </Stack>
                )}
              </Box>
            )
          })}
        </Stack>
      )}
    </ResponsiveModal>
  )
}

AddTasksModal.propTypes = {
  chores: PropTypes.array.isRequired,
  draft: PropTypes.object.isRequired,
  onAdd: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  routines: PropTypes.array.isRequired,
}

// The steps of a routine: drag to reorder, tap to make one optional.
export const RoutineSteps = ({ chores, draft, names, routines, setDraft }) => {
  const { t } = useTranslation('games')
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const ids = draft.choreIds.map((_, index) => stepKey(draft, index))
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id)
    const to = ids.indexOf(over.id)
    if (from >= 0 && to >= 0) setDraft(moveStepTo(draft, from, to))
  }
  return (
    <Stack gap={0.75}>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {draft.choreIds.map((choreId, index) => (
            <StepRow
              key={ids[index]}
              id={ids[index]}
              chore={chores.find(chore => chore.id === choreId)}
              draft={draft}
              index={index}
              names={names}
              setDraft={setDraft}
            />
          ))}
        </SortableContext>
      </DndContext>
      {draft.choreIds.length < MAX_ROUTINE_STEPS && (
        <Button
          variant='outlined'
          size='lg'
          startDecorator={<AddRounded />}
          onClick={() => setAdding(true)}
          sx={{ borderStyle: 'dashed' }}
        >
          {t('routines.addTasks')}
        </Button>
      )}
      <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
        {t('routines.stepsHelp')}
      </Typography>
      {adding && (
        <AddTasksModal
          chores={chores}
          draft={draft}
          routines={routines}
          onClose={() => setAdding(false)}
          onAdd={entries => {
            setDraft(addSteps(draft, entries))
            setAdding(false)
          }}
        />
      )}
    </Stack>
  )
}

RoutineSteps.propTypes = {
  chores: PropTypes.array.isRequired,
  draft: PropTypes.object.isRequired,
  names: PropTypes.instanceOf(Map).isRequired,
  routines: PropTypes.array.isRequired,
  setDraft: PropTypes.func.isRequired,
}
