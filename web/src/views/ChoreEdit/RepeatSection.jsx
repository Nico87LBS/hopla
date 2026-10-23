import { AddRounded, DeleteOutlineRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  Card,
  Checkbox,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  Input,
  List,
  ListItem,
  Option,
  Radio,
  RadioGroup,
  Select,
  Typography,
} from '@mui/joy'
import moment from 'moment'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import NumberInput from '../../components/common/NumberInput'
import { useLocalization } from '../../contexts/LocalizationContext'

const FREQUENCY_TYPES_RADIOS = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'adaptive',
  'always',
  'custom',
]

const FREQUENCY_TYPE_WITH_MESSAGE = ['adaptive', 'custom', 'always']
const REPEAT_ON_TYPE = ['interval', 'days_of_the_week', 'day_of_the_month']
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

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const WEEK_PATTERNS = ['every_week', 'week_of_month']

const DAY_OCCURRENCE_VALUES = [1, 2, 3, 4, -1]

// -1 is the "last occurrence" sentinel; everything else keys off its number.
const occurrenceKey = value => (value === -1 ? 'last' : String(value))

// Helper function to generate schedule preview text
const generateSchedulePreview = (metadata, formatTimeFn, t) => {
  if (!metadata?.days?.length) return ''

  const dayNames = metadata.days
    .map(day => t(`repeat.daysShort.${day}`))
    .join(', ')

  const timeStr = metadata.time
    ? formatTimeFn(metadata.time)
    : t('repeat.defaultTime')

  if (
    metadata.weekPattern === 'week_of_month' &&
    metadata.occurrences?.length
  ) {
    const occurrenceStr = metadata.occurrences
      .map(w => t(`repeat.ordinal.${occurrenceKey(w)}`))
      .join(', ')
    return t('repeat.previewOccurrence', {
      occurrences: occurrenceStr,
      days: dayNames,
      time: timeStr,
    })
  }

  return t('repeat.previewEvery', { days: dayNames, time: timeStr })
}

export const RepeatOnSections = ({
  frequency,
  frequencyMetadata,
  frequencyType,
  onFrequencyMetadataUpdate,
  onFrequencyUpdate,
}) => {
  const { fmt } = useLocalization()
  const { t } = useTranslation('chores')
  // if time on frequencyMetadata is not set, try to set it to the nextDueDate if available,
  // otherwise set it to 18:00 of the current day
  useEffect(() => {
    if (!frequencyMetadata?.time) {
      frequencyMetadata.time = moment(
        moment(new Date()).format('YYYY-MM-DD') + 'T' + '18:00',
      ).format()
    }
    // Initialize weekPattern if not set
    if (!frequencyMetadata?.weekPattern) {
      onFrequencyMetadataUpdate({
        ...frequencyMetadata,
        weekPattern: 'every_week',
        occurrences: [],
      })
    }
  }, [frequencyMetadata, onFrequencyMetadataUpdate])

  const timePickerComponent = (
    <Grid
      item
      sm={12}
      sx={{
        display: 'flex',
        direction: 'column',
        flexDirection: 'column',
      }}
    >
      <Typography level='h5'>{t('repeat.timeOfDay')}</Typography>
      <Input
        type='time'
        sx={{ width: '150px' }}
        defaultValue={moment(frequencyMetadata?.time).format('HH:mm')}
        onChange={e => {
          onFrequencyMetadataUpdate({
            ...frequencyMetadata,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            time: moment(
              moment(new Date()).format('YYYY-MM-DD') + 'T' + e.target.value,
            ).format(),
          })
        }}
      />
    </Grid>
  )

  switch (frequencyType) {
    case 'interval':
      return (
        <>
          <Grid item sm={12} sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography level='h5'>{t('repeat.every')}</Typography>
            <NumberInput
              min={1}
              max={1000}
              value={frequency}
              onValueChange={onFrequencyUpdate}
            />
            <Select
              placeholder={t('repeat.unitPlaceholder')}
              value={frequencyMetadata?.unit || 'days'}
              sx={{ ml: 1 }}
            >
              {['hours', 'days', 'weeks', 'months', 'years'].map(item => (
                <Option
                  key={item}
                  value={item}
                  onClick={() => {
                    onFrequencyMetadataUpdate({
                      ...frequencyMetadata,
                      unit: item,
                    })
                  }}
                >
                  {t(`repeat.unit.${item}`)}
                </Option>
              ))}
            </Select>
          </Grid>
          {timePickerComponent}
        </>
      )
    case 'days_of_the_week':
      return (
        <>
          <Grid item sm={12} sx={{ display: 'flex', alignItems: 'center' }}>
            <Card>
              <List
                orientation='horizontal'
                wrap
                sx={{
                  '--List-gap': '8px',
                  '--ListItem-radius': '20px',
                }}
              >
                {DAYS.map(item => (
                  <ListItem key={item}>
                    <Checkbox
                      checked={frequencyMetadata?.days?.includes(item) || false}
                      onClick={() => {
                        const newDaysOfTheWeek = frequencyMetadata['days'] || []
                        if (newDaysOfTheWeek.includes(item)) {
                          newDaysOfTheWeek.splice(
                            newDaysOfTheWeek.indexOf(item),
                            1,
                          )
                        } else {
                          newDaysOfTheWeek.push(item)
                        }

                        onFrequencyMetadataUpdate({
                          ...frequencyMetadata,
                          days: newDaysOfTheWeek.sort(),
                        })
                      }}
                      overlay
                      disableIcon
                      variant='soft'
                      label={t(`repeat.days.${item}`)}
                    />
                  </ListItem>
                ))}
              </List>
              <Button
                size='sm'
                variant='soft'
                color='neutral'
                checked={frequencyMetadata?.days?.length === 7}
                onClick={() => {
                  if (frequencyMetadata?.days?.length === 7) {
                    onFrequencyMetadataUpdate({
                      ...frequencyMetadata,
                      days: [],
                      weekPattern: 'every_week',
                      occurrences: [],
                    })
                  } else {
                    onFrequencyMetadataUpdate({
                      ...frequencyMetadata,
                      days: DAYS.map(item => item),
                    })
                  }
                }}
                overlay
                disableIcon
              >
                {frequencyMetadata?.days?.length === 7
                  ? t('repeat.unselectAll')
                  : t('repeat.selectAll')}
              </Button>
            </Card>
          </Grid>

          <Grid item sm={12} sx={{ display: 'flex', alignItems: 'center' }}>
            <Box>
              <RadioGroup
                value={frequencyMetadata?.weekPattern || 'every_week'}
                onChange={event => {
                  const newPattern = event.target.value
                  onFrequencyMetadataUpdate({
                    ...frequencyMetadata,
                    weekPattern: newPattern,
                    occurrences:
                      newPattern === 'every_week'
                        ? []
                        : frequencyMetadata?.occurrences || [],
                  })
                }}
                sx={{ gap: 1, '& > div': { p: 1 } }}
              >
                {WEEK_PATTERNS.map(value => (
                  <FormControl key={value}>
                    <Radio
                      value={value}
                      label={t(`repeat.weekPattern.${value}`)}
                      variant='soft'
                    />
                    <FormHelperText>
                      {t(`repeat.weekPatternHelp.${value}`)}
                    </FormHelperText>
                  </FormControl>
                ))}
              </RadioGroup>

              {frequencyMetadata?.weekPattern === 'week_of_month' && (
                <Box>
                  <Typography level='body-sm' mb={1}>
                    {t('repeat.selectOccurrences')}
                  </Typography>
                  <Typography level='body-xs' color='neutral' mb={2}>
                    {t('repeat.occurrenceExample')}
                  </Typography>
                  <Card>
                    <List
                      orientation='horizontal'
                      wrap
                      sx={{
                        '--List-gap': '8px',
                        '--ListItem-radius': '20px',
                      }}
                    >
                      {DAY_OCCURRENCE_VALUES.map(option => (
                        <ListItem key={option}>
                          <Checkbox
                            checked={
                              frequencyMetadata?.occurrences?.includes(
                                option,
                              ) || false
                            }
                            onChange={() => {
                              const currentOccurrences =
                                frequencyMetadata?.occurrences || []
                              const newOccurrences =
                                currentOccurrences.includes(option)
                                  ? currentOccurrences.filter(w => w !== option)
                                  : [...currentOccurrences, option]
                              onFrequencyMetadataUpdate({
                                ...frequencyMetadata,
                                occurrences: newOccurrences.sort((a, b) => {
                                  if (a === -1) return 1 // Last occurrence goes to end
                                  if (b === -1) return -1
                                  return a - b
                                }),
                              })
                            }}
                            overlay
                            disableIcon
                            variant='soft'
                            label={t(
                              `repeat.occurrence.${occurrenceKey(option)}`,
                            )}
                          />
                        </ListItem>
                      ))}
                    </List>
                    <Button
                      size='sm'
                      variant='soft'
                      color='neutral'
                      onClick={() => {
                        if (
                          frequencyMetadata?.occurrences?.length ===
                          DAY_OCCURRENCE_VALUES.length
                        ) {
                          onFrequencyMetadataUpdate({
                            ...frequencyMetadata,
                            occurrences: [],
                          })
                        } else {
                          onFrequencyMetadataUpdate({
                            ...frequencyMetadata,
                            occurrences: [...DAY_OCCURRENCE_VALUES],
                          })
                        }
                      }}
                      overlay
                      disableIcon
                    >
                      {frequencyMetadata?.occurrences?.length ===
                      DAY_OCCURRENCE_VALUES.length
                        ? t('repeat.unselectAll')
                        : t('repeat.selectAll')}
                    </Button>
                  </Card>
                </Box>
              )}

              {/* Quarter week pattern removed - doesn't make sense with Nth day approach */}

              {/* Live Preview */}
              {frequencyMetadata?.days?.length > 0 && (
                <Card mt={2} p={2}>
                  <Typography level='body-sm' color='primary'>
                    {generateSchedulePreview(frequencyMetadata, fmt.time, t)}
                  </Typography>
                </Card>
              )}
            </Box>
          </Grid>

          {timePickerComponent}
        </>
      )
    case 'day_of_the_month':
      return (
        <>
          <Grid
            item
            sm={12}
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Card>
              <List
                orientation='horizontal'
                wrap
                sx={{
                  '--List-gap': '8px',
                  '--ListItem-radius': '20px',
                }}
              >
                {MONTHS.map(item => (
                  <ListItem key={item}>
                    <Checkbox
                      checked={frequencyMetadata?.months?.includes(item)}
                      onClick={() => {
                        const newMonthsOfTheYear =
                          frequencyMetadata['months'] || []
                        if (newMonthsOfTheYear.includes(item)) {
                          newMonthsOfTheYear.splice(
                            newMonthsOfTheYear.indexOf(item),
                            1,
                          )
                        } else {
                          newMonthsOfTheYear.push(item)
                        }

                        onFrequencyMetadataUpdate({
                          ...frequencyMetadata,
                          months: newMonthsOfTheYear.sort(),
                        })
                        console.log('newMonthsOfTheYear', newMonthsOfTheYear)
                        // setDaysOfTheWeek(newDaysOfTheWeek)
                      }}
                      overlay
                      disableIcon
                      variant='soft'
                      label={t(`repeat.months.${item}`)}
                    />
                  </ListItem>
                ))}
              </List>
              <Button
                size='sm'
                variant='soft'
                color='neutral'
                checked={frequencyMetadata?.months?.length === 12}
                onClick={() => {
                  if (frequencyMetadata?.months?.length === 12) {
                    onFrequencyMetadataUpdate({
                      ...frequencyMetadata,
                      months: [],
                    })
                  } else {
                    onFrequencyMetadataUpdate({
                      ...frequencyMetadata,
                      months: MONTHS.map(item => item),
                    })
                  }
                }}
                overlay
                disableIcon
              >
                {frequencyMetadata?.months?.length === 12
                  ? t('repeat.unselectAll')
                  : t('repeat.selectAll')}
              </Button>
            </Card>
          </Grid>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mb: 1.5,
            }}
          >
            <Typography>{t('repeat.onThe')}</Typography>
            <NumberInput
              sx={{ width: '80px' }}
              min={1}
              max={31}
              value={frequency}
              onValueChange={onFrequencyUpdate}
            />
            <Typography>{t('repeat.ofAboveMonths')}</Typography>
          </Box>
          {timePickerComponent}
        </>
      )

    default:
      return <></>
  }
}

const MAX_SLOTS = 6
const SLOT_FREQUENCY_TYPES = ['daily', 'days_of_the_week']

// The next slot after the last one: four hours later, or 08:00 for the first.
const nextSlotTime = slots => {
  const last = slots[slots.length - 1]?.time
  if (!last) return '08:00'
  const [hour, minute] = last.split(':').map(Number)
  return `${String(Math.min(hour + 4, 23)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// Slots: the task is done several times a day (morning, noon, evening), each
// time on its own.
export const SlotsEditor = ({
  frequencyMetadata,
  onFrequencyMetadataUpdate,
}) => {
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
      <Typography level='h5'>{t('slots.editor.title')}</Typography>
      <Typography level='body-sm' textColor='text.tertiary'>
        {t('slots.editor.help')}
      </Typography>
      {slots.map((slot, index) => (
        <Box key={index} sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
          <Input
            aria-label={t('slots.editor.name')}
            placeholder={t('slots.editor.namePlaceholder')}
            value={slot.name || ''}
            slotProps={{ input: { maxLength: 20 } }}
            onChange={e => change(index, 'name', e.target.value)}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <Input
            type='time'
            aria-label={t('slots.editor.time')}
            value={slot.time || ''}
            onChange={e => change(index, 'time', e.target.value)}
            sx={{ width: 136 }}
          />
          <IconButton
            variant='plain'
            color='neutral'
            aria-label={t('slots.editor.remove', {
              name: slot.name || slot.time,
            })}
            onClick={() => update(slots.filter((_, i) => i !== index))}
          >
            <DeleteOutlineRounded />
          </IconButton>
        </Box>
      ))}
      {slots.length < MAX_SLOTS && (
        <Button
          variant='soft'
          color='neutral'
          size='sm'
          startDecorator={<AddRounded />}
          onClick={() =>
            update([...slots, { name: '', time: nextSlotTime(slots) }])
          }
          sx={{ alignSelf: 'flex-start' }}
        >
          {t('slots.editor.add')}
        </Button>
      )}
      {slots.length > 0 && (
        <Typography level='body-xs' textColor='text.tertiary'>
          {t('slots.editor.rule')}
        </Typography>
      )}
    </Box>
  )
}

const RepeatSection = ({
  frequency,
  frequencyError,
  frequencyMetadata,
  frequencyType,
  onFrequencyMetadataUpdate,
  onFrequencyTypeUpdate,
  onFrequencyUpdate,
  viewOnly = false,
}) => {
  const { t } = useTranslation('chores')

  return (
    <Box>
      <FormControl>
        <Typography level='h4'>{t('repeat.picker.scheduleType')}</Typography>
        <Select
          aria-label={t('repeat.picker.scheduleType')}
          value={
            ['once', 'no_repeat'].includes(frequencyType)
              ? 'once'
              : frequencyType === 'trigger'
                ? 'trigger'
                : frequencyType === 'always'
                  ? 'always'
                  : 'repeat'
          }
          onChange={(_, mode) => {
            if (!mode) return
            onFrequencyTypeUpdate(mode === 'repeat' ? 'daily' : mode)
          }}
        >
          <Option value='once'>{t('taskEditor.oneTimeTask')}</Option>
          <Option value='repeat'>{t('taskEditor.repeatingTask')}</Option>
          <Option value='trigger'>
            {t('taskEditor.triggeredFromOutside')}
          </Option>
          {frequencyType === 'always' && (
            <Option value='always'>{t('taskEditor.alwaysAvailable')}</Option>
          )}
        </Select>
      </FormControl>
      {!['once', 'no_repeat', 'trigger', 'always'].includes(frequencyType) && (
        <>
          <Card
            variant='plain'
            sx={{ mt: 2, p: 0, bgcolor: 'transparent', gap: 1.5 }}
          >
            <Typography level='h5'>{t('taskEditor.repeats')}</Typography>

            <List
              orientation='horizontal'
              wrap
              sx={{
                '--List-gap': '8px',
                '--ListItem-radius': '20px',
              }}
            >
              {FREQUENCY_TYPES_RADIOS.map(item => (
                <ListItem key={item}>
                  <Checkbox
                    // disabled={index === 0}
                    checked={
                      item === frequencyType ||
                      (item === 'custom' &&
                        REPEAT_ON_TYPE.includes(frequencyType))
                    }
                    // defaultChecked={item === frequencyType}
                    onClick={() => {
                      if (item === 'custom') {
                        onFrequencyTypeUpdate(REPEAT_ON_TYPE[0])
                        onFrequencyUpdate(1)
                        onFrequencyMetadataUpdate({
                          unit: 'days',
                          time: frequencyMetadata?.time
                            ? frequencyMetadata?.time
                            : moment(
                                moment(new Date()).format('YYYY-MM-DD') +
                                  'T' +
                                  '18:00',
                              ).format(),
                          timezone:
                            Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })

                        return
                      }
                      onFrequencyTypeUpdate(item)
                    }}
                    overlay
                    disableIcon
                    variant='soft'
                    label={t(`repeat.freqType.${item}`)}
                  />
                </ListItem>
              ))}
            </List>
            <Typography>
              {FREQUENCY_TYPE_WITH_MESSAGE.includes(frequencyType)
                ? t(`repeat.freqMessage.${frequencyType}`)
                : ''}
            </Typography>
            {frequencyType === 'custom' ||
              (REPEAT_ON_TYPE.includes(frequencyType) && (
                <>
                  <Grid container spacing={1} mt={2}>
                    <Grid item>
                      <Typography>{t('repeat.repeatOn')}</Typography>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                      >
                        <RadioGroup
                          orientation='horizontal'
                          aria-labelledby='segmented-controls-example'
                          name='justify'
                          // value={justify}
                          // onChange={event => setJustify(event.target.value)}
                          sx={{
                            minHeight: 48,
                            padding: '4px',
                            borderRadius: '12px',
                            bgcolor: 'neutral.softBg',
                            '--RadioGroup-gap': '4px',
                            '--Radio-actionRadius': '8px',
                            mb: 1,
                          }}
                        >
                          {REPEAT_ON_TYPE.map(item => (
                            <Radio
                              key={item}
                              color='neutral'
                              checked={item === frequencyType}
                              onClick={() => {
                                if (
                                  item === 'day_of_the_month' ||
                                  item === 'interval'
                                ) {
                                  onFrequencyUpdate(1)
                                }
                                onFrequencyTypeUpdate(item)
                                if (item === 'days_of_the_week') {
                                  onFrequencyMetadataUpdate({
                                    ...frequencyMetadata,
                                    days: [],
                                    weekPattern: 'every_week',
                                    weekNumbers: [],
                                  })
                                } else if (item === 'day_of_the_month') {
                                  onFrequencyMetadataUpdate({
                                    ...frequencyMetadata,
                                    months: [],
                                  })
                                } else if (item === 'interval') {
                                  onFrequencyMetadataUpdate({
                                    ...frequencyMetadata,
                                    unit: 'days',
                                  })
                                }
                                // setRepeatOn(item)
                              }}
                              value={item}
                              disableIcon
                              label={t(`repeat.repeatOnType.${item}`)}
                              variant='plain'
                              sx={{
                                px: 2,
                                alignItems: 'center',
                              }}
                              slotProps={{
                                action: ({ checked }) => ({
                                  sx: {
                                    ...(checked && {
                                      bgcolor: 'background.surface',
                                      boxShadow: 'sm',
                                      '&:hover': {
                                        bgcolor: 'background.surface',
                                      },
                                    }),
                                  },
                                }),
                              }}
                            />
                          ))}
                        </RadioGroup>
                      </Box>
                    </Grid>

                    <RepeatOnSections
                      frequency={frequency}
                      onFrequencyUpdate={onFrequencyUpdate}
                      frequencyType={frequencyType}
                      onFrequencyTypeUpdate={onFrequencyTypeUpdate}
                      frequencyMetadata={frequencyMetadata || {}}
                      onFrequencyMetadataUpdate={onFrequencyMetadataUpdate}
                    />
                  </Grid>
                </>
              ))}
            {SLOT_FREQUENCY_TYPES.includes(frequencyType) && !viewOnly && (
              <SlotsEditor
                frequencyMetadata={frequencyMetadata || {}}
                onFrequencyMetadataUpdate={onFrequencyMetadataUpdate}
              />
            )}
            <FormControl error={Boolean(frequencyError)}>
              <FormHelperText error>{frequencyError}</FormHelperText>
            </FormControl>
          </Card>
        </>
      )}
      {frequencyType === 'trigger' && (
        <Typography level='body-sm' textColor='text.tertiary' sx={{ mt: 1 }}>
          {t('taskEditor.triggeredFromOutsideHelp')}
        </Typography>
      )}
    </Box>
  )
}

export default RepeatSection
