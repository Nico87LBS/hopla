import {
  AddRounded,
  CloseRounded,
  ScheduleRounded,
  SensorsRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Input,
  Option,
  Select,
  Switch,
  Typography,
} from '@mui/joy'
import moment from 'moment'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import NumberInput from '../../../components/common/NumberInput'
import EditorCard, { FieldLabel, Pill, Segmented } from './EditorCard'
import {
  frequencyTypeForKind,
  RHYTHMS,
  scheduleKind,
  SLOT_FREQUENCY_TYPES,
} from './schedule'

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const OCCURRENCES = [1, 2, 3, 4, -1]
const MAX_SLOTS = 6

const occurrenceKey = value => (value === -1 ? 'last' : String(value))
const toggle = (list = [], item) =>
  list.includes(item) ? list.filter(x => x !== item) : [...list, item]

// The next slot after the last one: four hours later, or 08:00 for the first.
const nextSlotTime = slots => {
  const last = slots[slots.length - 1]?.time
  if (!last) return '08:00'
  const [hour, minute] = last.split(':').map(Number)
  return `${String(Math.min(hour + 4, 23)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const InfoLine = ({ children, icon: Icon = ScheduleRounded }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 1,
      px: 1.5,
      py: 1.25,
      bgcolor: 'background.level1',
      borderRadius: '12px',
      color: 'text.secondary',
    }}
  >
    <Icon sx={{ fontSize: 18, mt: '1px' }} />
    <Typography level='body-sm' sx={{ color: 'inherit' }}>
      {children}
    </Typography>
  </Box>
)

InfoLine.propTypes = { children: PropTypes.node, icon: PropTypes.elementType }

// The slots of a task done several times a day, each one a pill with its name
// and time.
const Slots = ({ frequencyMetadata, onFrequencyMetadataUpdate }) => {
  const { t } = useTranslation('chores')
  const slots = frequencyMetadata?.slots || []
  const update = next =>
    onFrequencyMetadataUpdate({
      ...frequencyMetadata,
      timezone:
        frequencyMetadata?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      slots: next,
    })
  const change = (index, field, value) =>
    update(
      slots.map((slot, i) =>
        i === index ? { ...slot, [field]: value } : slot,
      ),
    )
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FieldLabel>{t('editor.when.slots')}</FieldLabel>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {slots.map((slot, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              minHeight: 44,
              pl: 0.5,
              pr: 0.25,
              border: '1px solid',
              borderColor: 'primary.200',
              bgcolor: 'primary.softBg',
              borderRadius: '22px',
              '& input': { fontWeight: 600, color: 'primary.softColor' },
            }}
          >
            <Input
              variant='plain'
              aria-label={t('slots.editor.name')}
              placeholder={t('editor.when.slotName')}
              value={slot.name || ''}
              slotProps={{ input: { maxLength: 20 } }}
              onChange={e => change(index, 'name', e.target.value)}
              sx={{
                width: 92,
                minHeight: 36,
                bgcolor: 'transparent',
                '--Input-focusedThickness': '0px',
              }}
            />
            <Input
              variant='plain'
              type='time'
              aria-label={t('slots.editor.time')}
              value={slot.time || ''}
              onChange={e => change(index, 'time', e.target.value)}
              sx={{
                width: 136,
                minHeight: 36,
                bgcolor: 'transparent',
                '--Input-focusedThickness': '0px',
              }}
            />
            <IconButton
              size='sm'
              variant='plain'
              color='neutral'
              aria-label={t('slots.editor.remove', {
                name: slot.name || slot.time,
              })}
              onClick={() => update(slots.filter((_, i) => i !== index))}
              sx={{ borderRadius: '50%' }}
            >
              <CloseRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ))}
        {slots.length < MAX_SLOTS && (
          <Button
            variant='outlined'
            color='primary'
            startDecorator={<AddRounded />}
            onClick={() =>
              update([...slots, { name: '', time: nextSlotTime(slots) }])
            }
            sx={{
              minHeight: 44,
              borderRadius: '22px',
              borderStyle: 'dashed',
              borderColor: 'neutral.outlinedBorder',
            }}
          >
            {t('editor.when.addSlot')}
          </Button>
        )}
      </Box>
      <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
        {slots.length ? t('editor.when.slotsRule') : t('editor.when.slotsHelp')}
      </Typography>
    </Box>
  )
}

Slots.propTypes = {
  frequencyMetadata: PropTypes.object,
  onFrequencyMetadataUpdate: PropTypes.func.isRequired,
}

// A due date with an optional time of day.
const DateTime = ({
  allowNoDate,
  dateLabel,
  dueDateOnly,
  dueTime,
  onDateChange,
  onTimeChange,
  onUseTime,
  quickDates,
  useCustomTime,
}) => {
  const { t } = useTranslation('chores')
  const today = moment().format('YYYY-MM-DD')
  const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD')
  const otherDate = dueDateOnly && ![today, tomorrow].includes(dueDateOnly)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {quickDates ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Pill
            selected={dueDateOnly === today}
            onClick={() => onDateChange(today)}
          >
            {t('editor.when.today')}
          </Pill>
          <Pill
            selected={dueDateOnly === tomorrow}
            onClick={() => onDateChange(tomorrow)}
          >
            {t('editor.when.tomorrow')}
          </Pill>
          <Input
            type='date'
            aria-label={t('editor.when.otherDate')}
            value={otherDate ? dueDateOnly : ''}
            onChange={e => onDateChange(e.target.value || null)}
            sx={{
              minHeight: 40,
              borderRadius: '20px',
              ...(otherDate && {
                borderColor: 'primary.300',
                bgcolor: 'primary.softBg',
              }),
            }}
          />
          {allowNoDate && (
            <Pill selected={!dueDateOnly} onClick={() => onDateChange(null)}>
              {t('editor.when.noDate')}
            </Pill>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {dateLabel}
          </Typography>
          <Input
            type='date'
            aria-label={dateLabel}
            value={dueDateOnly || ''}
            onChange={e => onDateChange(e.target.value || null)}
            sx={{ minHeight: 40 }}
          />
          {allowNoDate && dueDateOnly && (
            <IconButton
              variant='plain'
              color='neutral'
              aria-label={t('actionMenu.removeDueDate')}
              onClick={() => onDateChange(null)}
            >
              <CloseRounded />
            </IconButton>
          )}
        </Box>
      )}
      {dueDateOnly && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('editor.when.at')}
          </Typography>
          {useCustomTime ? (
            <>
              <Input
                type='time'
                aria-label={t('taskEditor.dueTime')}
                value={dueTime || '18:00'}
                onChange={onTimeChange}
                sx={{ minHeight: 40 }}
              />
              <IconButton
                variant='plain'
                color='neutral'
                aria-label={t('taskEditor.removeTime')}
                onClick={() => onUseTime(false)}
              >
                <CloseRounded />
              </IconButton>
            </>
          ) : (
            <Button
              variant='outlined'
              color='neutral'
              startDecorator={<AddRounded />}
              onClick={() => onUseTime(true)}
            >
              {t('editor.when.addTime')}
            </Button>
          )}
          {!useCustomTime && (
            <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
              {t('editor.when.anyTime')}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}

DateTime.propTypes = {
  allowNoDate: PropTypes.bool,
  dateLabel: PropTypes.string,
  dueDateOnly: PropTypes.string,
  dueTime: PropTypes.string,
  onDateChange: PropTypes.func.isRequired,
  onTimeChange: PropTypes.func.isRequired,
  onUseTime: PropTypes.func.isRequired,
  quickDates: PropTypes.bool,
  useCustomTime: PropTypes.bool,
}

// "When?": once, repeated, always there or set off from outside, and the
// details of each.
export default function WhenCard({
  dueDateOnly,
  dueTime,
  error,
  frequency,
  frequencyMetadata,
  frequencyType,
  isEditing,
  isRolling,
  nextLabel,
  onDateChange,
  onFrequencyMetadataUpdate,
  onFrequencyTypeUpdate,
  onFrequencyUpdate,
  onIsRollingChange,
  onTimeChange,
  onUseTime,
  useCustomTime,
}) {
  const { t } = useTranslation('chores')
  const kind = scheduleKind(frequencyType)
  const metadata = frequencyMetadata || {}
  const withSlots =
    SLOT_FREQUENCY_TYPES.includes(frequencyType) && metadata.slots?.length > 0
  const pickRhythm = rhythm => {
    if (rhythm === frequencyType) return
    if (rhythm === 'interval') {
      onFrequencyUpdate(1)
      onFrequencyMetadataUpdate({ ...metadata, unit: metadata.unit || 'days' })
    } else if (rhythm === 'days_of_the_week') {
      onFrequencyMetadataUpdate({
        ...metadata,
        days: metadata.days?.length ? metadata.days : [],
        weekPattern: metadata.weekPattern || 'every_week',
        occurrences: metadata.occurrences || [],
      })
    } else if (rhythm === 'day_of_the_month') {
      onFrequencyUpdate(1)
      onFrequencyMetadataUpdate({ ...metadata, months: metadata.months || [] })
    }
    onFrequencyTypeUpdate(rhythm)
  }
  const dateTimeProps = {
    dueDateOnly,
    dueTime,
    onDateChange,
    onTimeChange,
    onUseTime,
    useCustomTime,
  }

  return (
    <EditorCard section='when' title={t('editor.when.title')} error={error}>
      <Segmented
        label={t('editor.when.kind')}
        value={kind}
        onChange={value => {
          if (value !== kind) onFrequencyTypeUpdate(frequencyTypeForKind(value))
        }}
        options={['once', 'repeat', 'always', 'trigger'].map(value => ({
          value,
          label: t(`editor.when.kinds.${value}`),
        }))}
      />

      {kind === 'once' && (
        <DateTime {...dateTimeProps} quickDates allowNoDate />
      )}

      {kind === 'repeat' && (
        <>
          <Select
            aria-label={t('editor.when.rhythm')}
            value={RHYTHMS.includes(frequencyType) ? frequencyType : 'daily'}
            onChange={(_, value) => value && pickRhythm(value)}
            sx={{ minHeight: 44, fontWeight: 600 }}
          >
            {RHYTHMS.map(value => (
              <Option key={value} value={value}>
                {t(`editor.when.rhythms.${value}`)}
              </Option>
            ))}
          </Select>

          {frequencyType === 'interval' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography level='body-md'>{t('editor.when.every')}</Typography>
              <NumberInput
                aria-label={t('editor.when.every')}
                min={1}
                max={1000}
                value={frequency}
                onValueChange={onFrequencyUpdate}
                sx={{ width: 76 }}
              />
              <Select
                aria-label={t('repeat.unitPlaceholder')}
                value={metadata.unit || 'days'}
                onChange={(_, unit) =>
                  unit && onFrequencyMetadataUpdate({ ...metadata, unit })
                }
                sx={{ flex: 1 }}
              >
                {['hours', 'days', 'weeks', 'months', 'years'].map(item => (
                  <Option key={item} value={item}>
                    {t(`repeat.unit.${item}`)}
                  </Option>
                ))}
              </Select>
            </Box>
          )}

          {frequencyType === 'days_of_the_week' && (
            <>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: 0.75,
                }}
              >
                {DAYS.map(day => (
                  <Pill
                    key={day}
                    label={t(`repeat.days.${day}`)}
                    selected={metadata.days?.includes(day)}
                    onClick={() =>
                      onFrequencyMetadataUpdate({
                        ...metadata,
                        days: toggle(metadata.days, day).sort(),
                      })
                    }
                    sx={{ px: 0, borderRadius: '12px', fontSize: 13 }}
                  >
                    {t(`repeat.daysShort.${day}`)}
                  </Pill>
                ))}
              </Box>
              <Select
                aria-label={t('editor.when.weeks')}
                value={metadata.weekPattern || 'every_week'}
                onChange={(_, weekPattern) =>
                  weekPattern &&
                  onFrequencyMetadataUpdate({
                    ...metadata,
                    weekPattern,
                    occurrences:
                      weekPattern === 'every_week'
                        ? []
                        : metadata.occurrences || [],
                  })
                }
              >
                <Option value='every_week'>{t('editor.when.everyWeek')}</Option>
                <Option value='week_of_month'>
                  {t('editor.when.someWeeks')}
                </Option>
              </Select>
              {metadata.weekPattern === 'week_of_month' && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {OCCURRENCES.map(value => (
                    <Pill
                      key={value}
                      selected={metadata.occurrences?.includes(value)}
                      onClick={() =>
                        onFrequencyMetadataUpdate({
                          ...metadata,
                          occurrences: toggle(metadata.occurrences, value).sort(
                            (a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b),
                          ),
                        })
                      }
                    >
                      {t(`repeat.occurrence.${occurrenceKey(value)}`)}
                    </Pill>
                  ))}
                </Box>
              )}
            </>
          )}

          {frequencyType === 'day_of_the_month' && (
            <>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 0.75,
                }}
              >
                {MONTHS.map(month => (
                  <Pill
                    key={month}
                    label={t(`repeat.months.${month}`)}
                    selected={metadata.months?.includes(month)}
                    onClick={() =>
                      onFrequencyMetadataUpdate({
                        ...metadata,
                        months: toggle(metadata.months, month),
                      })
                    }
                    sx={{ px: 0, borderRadius: '12px', fontSize: 13 }}
                  >
                    {t(`repeat.monthsShort.${month}`)}
                  </Pill>
                ))}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography level='body-md'>{t('repeat.onThe')}</Typography>
                <NumberInput
                  aria-label={t('repeat.picker.dayOfMonth')}
                  min={1}
                  max={31}
                  value={frequency}
                  onValueChange={onFrequencyUpdate}
                  sx={{ width: 76 }}
                />
                <Typography level='body-md'>
                  {t('repeat.ofAboveMonths')}
                </Typography>
              </Box>
            </>
          )}

          {frequencyType === 'adaptive' && (
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {t('repeat.freqMessage.adaptive')}
            </Typography>
          )}

          {SLOT_FREQUENCY_TYPES.includes(frequencyType) && (
            <Slots
              frequencyMetadata={metadata}
              onFrequencyMetadataUpdate={onFrequencyMetadataUpdate}
            />
          )}

          {!withSlots && (
            <DateTime
              {...dateTimeProps}
              dateLabel={
                isEditing ? t('editor.when.nextOn') : t('editor.when.from')
              }
            />
          )}

          {!withSlots && frequencyType !== 'adaptive' && (
            <Box
              component='label'
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                minHeight: 44,
                cursor: 'pointer',
              }}
            >
              <Box>
                <Typography level='title-sm'>
                  {t('editor.when.rolling')}
                </Typography>
                <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                  {t('editor.when.rollingHelp')}
                </Typography>
              </Box>
              <Switch
                checked={Boolean(isRolling)}
                onChange={e => onIsRollingChange(e.target.checked)}
              />
            </Box>
          )}

          {nextLabel && <InfoLine>{nextLabel}</InfoLine>}
        </>
      )}

      {kind === 'always' && <InfoLine>{t('editor.when.alwaysHelp')}</InfoLine>}

      {kind === 'trigger' && (
        <>
          <InfoLine icon={SensorsRounded}>
            {t('editor.when.triggerHelp')}
          </InfoLine>
          {dueDateOnly && (
            <DateTime
              {...dateTimeProps}
              allowNoDate
              dateLabel={t('editor.when.triggerDue')}
            />
          )}
        </>
      )}
    </EditorCard>
  )
}

WhenCard.propTypes = {
  dueDateOnly: PropTypes.string,
  dueTime: PropTypes.string,
  error: PropTypes.node,
  frequency: PropTypes.number,
  frequencyMetadata: PropTypes.object,
  frequencyType: PropTypes.string.isRequired,
  isEditing: PropTypes.bool,
  isRolling: PropTypes.bool,
  nextLabel: PropTypes.node,
  onDateChange: PropTypes.func.isRequired,
  onFrequencyMetadataUpdate: PropTypes.func.isRequired,
  onFrequencyTypeUpdate: PropTypes.func.isRequired,
  onFrequencyUpdate: PropTypes.func.isRequired,
  onIsRollingChange: PropTypes.func.isRequired,
  onTimeChange: PropTypes.func.isRequired,
  onUseTime: PropTypes.func.isRequired,
  useCustomTime: PropTypes.bool,
}
