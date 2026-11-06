import { ArrowBackRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Input,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import {
  BONUS_PRESETS,
  draftOrderMode,
  MAX_ROUTINE_STEPS,
  MAX_VALIDITY,
  previewSteps,
  routineHoursError,
  VALIDITY_PRESETS,
  withOrder,
} from '../../utils/routines'
import { RoutineSteps } from './RoutineSteps'

const blockSx = {
  minWidth: 0,
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'lg',
  p: 1.5,
}

const Block = ({ children, number, right, title }) => (
  <Sheet variant='plain' sx={blockSx}>
    <Stack direction='row' alignItems='center' gap={1} sx={{ mb: 1.25 }}>
      <Typography
        level='title-sm'
        sx={{
          bgcolor: HOPLA.violetSoft,
          borderRadius: '50%',
          color: HOPLA.violet,
          display: 'grid',
          height: 24,
          placeItems: 'center',
          width: 24,
        }}
      >
        {number}
      </Typography>
      <Typography level='title-md' sx={{ flex: 1 }}>
        {title}
      </Typography>
      {right}
    </Stack>
    {children}
  </Sheet>
)

Block.propTypes = {
  children: PropTypes.node,
  number: PropTypes.number.isRequired,
  right: PropTypes.node,
  title: PropTypes.string.isRequired,
}

// A row of choices with the chosen one filled in.
const Choices = ({ choices, onPick, value }) => (
  <Stack direction='row' gap={0.75} flexWrap='wrap'>
    {choices.map(choice => (
      <Button
        key={choice.key}
        size='sm'
        variant={choice.key === value ? 'solid' : 'outlined'}
        color={choice.key === value ? 'primary' : 'neutral'}
        onClick={() => onPick(choice)}
        sx={{ borderRadius: 999 }}
      >
        {choice.label}
      </Button>
    ))}
  </Stack>
)

Choices.propTypes = {
  choices: PropTypes.array.isRequired,
  onPick: PropTypes.func.isRequired,
  value: PropTypes.string,
}

const hoursLabel = (t, minutes) =>
  minutes === 1440
    ? t('routines.allDay')
    : t('routines.hours', { count: +(minutes / 60).toFixed(1) })

// The routine's hours: it opens at the first and closes at the second, every
// day. Both or neither; without them the routine opens as soon as a step is
// due, for the time chosen below.
const HoursFields = ({ draft, setDraft }) => {
  const { t } = useTranslation('games')
  const wrong = routineHoursError(draft)
  const field = (key, label) => (
    <Box sx={{ flex: 1, minWidth: 130 }}>
      <Typography level='body-xs' fontWeight='lg' sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Input
        type='time'
        value={draft[key] || ''}
        onChange={event => setDraft({ ...draft, [key]: event.target.value })}
        error={Boolean(wrong)}
        endDecorator={
          draft[key] ? (
            <IconButton
              size='sm'
              variant='plain'
              aria-label={t('routines.clearHour', { label })}
              onClick={() => setDraft({ ...draft, [key]: '' })}
            >
              ×
            </IconButton>
          ) : null
        }
      />
    </Box>
  )
  return (
    <Box>
      <Stack direction='row' gap={1} flexWrap='wrap'>
        {field('startsAt', t('routines.startsAt'))}
        {field('endsAt', t('routines.endsAt'))}
      </Stack>
      <Typography
        level='body-xs'
        sx={{ color: wrong ? 'danger.plainColor' : 'text.tertiary', mt: 0.75 }}
      >
        {wrong
          ? t(`routines.hoursError.${wrong}`)
          : draft.startsAt && draft.endsAt
            ? t('routines.hoursHelp', {
                start: draft.startsAt,
                end: draft.endsAt,
              })
            : t('routines.noHoursHelp')}
      </Typography>
    </Box>
  )
}

HoursFields.propTypes = {
  draft: PropTypes.object.isRequired,
  setDraft: PropTypes.func.isRequired,
}

const RoutineBlock = ({ draft, setDraft }) => {
  const { t } = useTranslation('games')
  const presetValidity = VALIDITY_PRESETS.includes(
    Number(draft.validityMinutes),
  )
  const presetBonus = BONUS_PRESETS.includes(Number(draft.bonus))
  const [otherValidity, setOtherValidity] = useState(!presetValidity)
  const [otherBonus, setOtherBonus] = useState(!presetBonus)
  const validity = otherValidity ? 'other' : String(draft.validityMinutes)
  const bonus = otherBonus ? 'other' : String(draft.bonus)
  return (
    <Block number={1} title={t('routines.blockRoutine')}>
      <Stack gap={1.25}>
        <Box>
          <Typography level='body-xs' fontWeight='lg' sx={{ mb: 0.5 }}>
            {t('routines.name')}
          </Typography>
          <Input
            size='lg'
            autoFocus={!draft.id}
            placeholder={t('routines.namePlaceholder')}
            value={draft.name}
            onChange={event => setDraft({ ...draft, name: event.target.value })}
            slotProps={{ input: { maxLength: 60 } }}
          />
        </Box>
        <Box>
          <Typography level='body-xs' fontWeight='lg' sx={{ mb: 0.5 }}>
            {t('routines.bonus')}
          </Typography>
          <Choices
            value={bonus}
            choices={[
              ...BONUS_PRESETS.map(count => ({
                key: String(count),
                label:
                  count === 0
                    ? t('routines.noBonus')
                    : t('goals.reward', { count }),
                count,
              })),
              { key: 'other', label: t('routines.other') },
            ]}
            onPick={choice => {
              setOtherBonus(choice.key === 'other')
              if (choice.key !== 'other') {
                setDraft({ ...draft, bonus: choice.count })
              }
            }}
          />
          {otherBonus && (
            <Input
              sx={{ mt: 0.75, maxWidth: 180 }}
              type='number'
              value={draft.bonus}
              onChange={event =>
                setDraft({ ...draft, bonus: event.target.value })
              }
              slotProps={{ input: { min: 0, max: 1000 } }}
            />
          )}
        </Box>
        <HoursFields draft={draft} setDraft={setDraft} />
        {!draft.startsAt && !draft.endsAt && (
          <Box>
            <Typography level='body-xs' fontWeight='lg' sx={{ mb: 0.5 }}>
              {t('routines.finishIn')}
            </Typography>
            <Choices
              value={validity}
              choices={[
                ...VALIDITY_PRESETS.map(minutes => ({
                  key: String(minutes),
                  label: hoursLabel(t, minutes),
                  minutes,
                })),
                { key: 'other', label: t('routines.other') },
              ]}
              onPick={choice => {
                setOtherValidity(choice.key === 'other')
                if (choice.key !== 'other') {
                  setDraft({ ...draft, validityMinutes: choice.minutes })
                }
              }}
            />
            {otherValidity && (
              <Input
                sx={{ mt: 0.75, maxWidth: 180 }}
                type='number'
                value={+(Number(draft.validityMinutes) / 60).toFixed(2)}
                onChange={event =>
                  setDraft({
                    ...draft,
                    validityMinutes: Math.min(
                      MAX_VALIDITY,
                      Math.max(1, Math.round(Number(event.target.value) * 60)),
                    ),
                  })
                }
                endDecorator={t('routines.hoursUnit')}
                slotProps={{
                  input: { min: 0.5, max: MAX_VALIDITY / 60, step: 0.5 },
                }}
              />
            )}
            <Typography
              level='body-xs'
              sx={{ color: 'text.tertiary', mt: 0.75 }}
            >
              {t('routines.finishInHelp')}
            </Typography>
          </Box>
        )}
      </Stack>
    </Block>
  )
}

RoutineBlock.propTypes = {
  draft: PropTypes.object.isRequired,
  setDraft: PropTypes.func.isRequired,
}

const OrderBlock = ({ draft, setDraft }) => {
  const { t } = useTranslation('games')
  const mode = draftOrderMode(draft)
  const modes = ['sequence', 'free', 'custom']
  return (
    <Block number={3} title={t('routines.blockOrder')}>
      <Stack
        direction='row'
        gap={0.5}
        sx={{ bgcolor: 'background.level1', borderRadius: 'md', p: 0.5 }}
      >
        {modes.map(item => (
          <Button
            key={item}
            fullWidth
            size='sm'
            variant={item === mode ? 'solid' : 'plain'}
            color={item === mode ? 'primary' : 'neutral'}
            onClick={() => setDraft(withOrder(draft, item))}
          >
            {t(`routines.order.${item}`)}
          </Button>
        ))}
      </Stack>
      <Typography level='body-xs' sx={{ color: 'text.tertiary', mt: 0.75 }}>
        {t(`routines.orderHelp.${mode}`)}
      </Typography>
    </Block>
  )
}

OrderBlock.propTypes = RoutineBlock.propTypes

// What a child sees at first, step by step.
const Preview = ({ draft, names }) => {
  const { t } = useTranslation('games')
  const steps = previewSteps(draft)
  return (
    <Sheet variant='plain' sx={blockSx}>
      <Typography level='title-md' sx={{ mb: 1 }}>
        {t('routines.preview')}
      </Typography>
      <Typography level='title-sm' sx={{ mb: 1 }}>
        {draft.name || t('routines.namePlaceholder')}
      </Typography>
      {steps.length === 0 && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('routines.previewEmpty')}
        </Typography>
      )}
      <Stack gap={0.75}>
        {steps.map(step => (
          <Box
            key={step.position}
            sx={{
              bgcolor: step.open ? HOPLA.violetSoft : 'background.level1',
              borderRadius: 'md',
              color: step.open ? HOPLA.violet : 'text.tertiary',
              fontWeight: 700,
              px: 1.25,
              py: 0.75,
            }}
          >
            {step.open ? '▶ ' : '🔒 '}
            {names.get(draft.choreIds[step.position - 1])}
            {step.optional && ` · ${t('routines.optional').toLowerCase()}`}
            {!step.open && (
              <Typography
                level='body-xs'
                sx={{ color: 'inherit', fontWeight: 400 }}
              >
                {t('routines.afterSteps', {
                  steps: step.waitsFor
                    .map(position => names.get(draft.choreIds[position - 1]))
                    .join(', '),
                })}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
      {Number(draft.bonus) > 0 && (
        <Box
          sx={{
            bgcolor: HOPLA.goldSoft,
            borderRadius: 'md',
            color: HOPLA.goldText,
            fontWeight: 700,
            mt: 1.25,
            px: 1.25,
            py: 0.75,
          }}
        >
          {draft.startsAt && draft.endsAt
            ? t('routines.previewBonusBy', {
                bonus: t('goals.reward', { count: Number(draft.bonus) }),
                time: draft.endsAt,
              })
            : t('routines.previewBonus', {
                bonus: t('goals.reward', { count: Number(draft.bonus) }),
                time: hoursLabel(
                  t,
                  Number(draft.validityMinutes),
                ).toLowerCase(),
              })}
        </Box>
      )}
    </Sheet>
  )
}

Preview.propTypes = {
  draft: PropTypes.object.isRequired,
  names: PropTypes.instanceOf(Map).isRequired,
}

// The editor of a routine: its settings, its steps, their order, and what a
// child will see.
export const RoutineEditor = ({
  chores,
  draft,
  names,
  onCancel,
  onSave,
  routines,
  setDraft,
}) => {
  const { t } = useTranslation('games')
  const valid =
    draft.name.trim() && draft.choreIds.length > 0 && !routineHoursError(draft)
  return (
    <Stack gap={1.5}>
      <Stack direction='row' alignItems='center' gap={1}>
        <IconButton
          variant='soft'
          color='primary'
          aria-label={t('presets.cancel')}
          onClick={onCancel}
        >
          <ArrowBackRounded />
        </IconButton>
        <Typography level='title-lg'>
          {draft.id
            ? t('routines.editTitle', { name: draft.name })
            : t('routines.newTitle')}
        </Typography>
      </Stack>
      <Box
        sx={{
          alignItems: 'start',
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 1fr) 340px',
          },
        }}
      >
        <Stack gap={1.5} sx={{ minWidth: 0 }}>
          <RoutineBlock draft={draft} setDraft={setDraft} />
          <Block
            number={2}
            title={t('routines.blockSteps')}
            right={
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {draft.choreIds.length} / {MAX_ROUTINE_STEPS}
              </Typography>
            }
          >
            <RoutineSteps
              chores={chores}
              draft={draft}
              names={names}
              routines={routines}
              setDraft={setDraft}
            />
          </Block>
          <OrderBlock draft={draft} setDraft={setDraft} />
        </Stack>
        <Preview draft={draft} names={names} />
      </Box>
      <Stack direction='row' gap={1} justifyContent='flex-end'>
        <Button size='lg' variant='outlined' color='neutral' onClick={onCancel}>
          {t('presets.cancel')}
        </Button>
        <Button size='lg' disabled={!valid} onClick={onSave}>
          {t('presets.save')}
        </Button>
      </Stack>
    </Stack>
  )
}

RoutineEditor.propTypes = {
  chores: PropTypes.array.isRequired,
  draft: PropTypes.object.isRequired,
  names: PropTypes.instanceOf(Map).isRequired,
  onCancel: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  routines: PropTypes.array.isRequired,
  setDraft: PropTypes.func.isRequired,
}
