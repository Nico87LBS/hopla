import {
  CloseRounded,
  ExpandLess,
  ExpandMore,
  SearchRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Checkbox,
  IconButton,
  Input,
  Option,
  Select,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  LISTENING,
  OPTIONS,
  TOLERANCES,
  wayOf,
  WAYS,
  ZONE_WAYS,
} from '../../utils/learn/cardOptions'
import { DRAWINGS } from '../../utils/learn/drawings'
import { drawingURL } from './PlayModes'

const Field = ({ children, help, id, label }) => (
  <Box>
    <Typography
      level='title-sm'
      component='label'
      htmlFor={id}
      sx={{ mb: 0.5, display: 'block' }}
    >
      {label}
    </Typography>
    {children}
    {help && (
      <Typography level='body-xs' sx={{ color: 'text.tertiary', mt: 0.5 }}>
        {help}
      </Typography>
    )}
  </Box>
)

Field.propTypes = {
  children: PropTypes.node,
  help: PropTypes.node,
  id: PropTypes.string,
  label: PropTypes.node.isRequired,
}

// ToleranceSelect picks how the spelling of a typed answer is checked.
export const ToleranceSelect = ({ onChange, value }) => {
  const { t } = useTranslation('learn')
  const id = useId()
  return (
    <Field label={t('options.tolerance')} id={id}>
      <Select
        slotProps={{ button: { id } }}
        value={value}
        onChange={(_, next) => next && onChange(next)}
      >
        {TOLERANCES.map(name => (
          <Option key={name} value={name}>
            {t(`options.tolerances.${name}`)}
          </Option>
        ))}
      </Select>
    </Field>
  )
}

ToleranceSelect.propTypes = {
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string.isRequired,
}

// DrawingGrid lists the drawings of the app, to pick one.
export const DrawingGrid = ({ onPick, value }) => {
  const { t } = useTranslation('learn')
  const [search, setSearch] = useState('')
  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase()
    return wanted ? DRAWINGS.filter(name => name.includes(wanted)) : DRAWINGS
  }, [search])
  return (
    <Box sx={{ mt: 1 }}>
      <Input
        size='sm'
        startDecorator={<SearchRounded />}
        placeholder={t('options.imageSearch')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{ mb: 1 }}
      />
      <Box
        role='listbox'
        aria-label={t('options.image')}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
          gap: 0.75,
          maxHeight: 248,
          overflowY: 'auto',
        }}
      >
        {shown.map(name => (
          <Box
            key={name}
            component='button'
            type='button'
            role='option'
            aria-selected={name === value}
            title={name}
            onClick={() => onPick(name)}
            sx={{
              p: 0.5,
              border: '2px solid',
              borderColor: name === value ? 'primary.solidBg' : 'transparent',
              borderRadius: 'md',
              bgcolor: 'background.level1',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            <Box
              component='img'
              src={drawingURL(name)}
              alt=''
              loading='lazy'
              sx={{ width: 44, height: 44 }}
            />
            <Typography
              level='body-xs'
              noWrap
              sx={{ maxWidth: '100%', color: 'text.secondary' }}
            >
              {name}
            </Typography>
          </Box>
        ))}
      </Box>
      {!shown.length && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('options.imageNone')}
        </Typography>
      )}
    </Box>
  )
}

DrawingGrid.propTypes = {
  onPick: PropTypes.func.isRequired,
  value: PropTypes.string,
}

// DrawingPicker picks a drawing of the app for a card, or none.
export const DrawingPicker = ({ onChange, value }) => {
  const { t } = useTranslation('learn')
  const [open, setOpen] = useState(false)
  return (
    <Field label={t('options.image')} help={t('options.imageHelp')}>
      <Stack direction='row' gap={1} alignItems='center'>
        {value && (
          <Box
            component='img'
            src={drawingURL(value)}
            alt={value}
            sx={{ width: 56, height: 56, borderRadius: 'md' }}
          />
        )}
        <Button
          size='sm'
          variant='outlined'
          color='neutral'
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          {t(value ? 'options.imageChange' : 'options.imagePick')}
        </Button>
        {value && (
          <IconButton
            size='sm'
            variant='plain'
            color='neutral'
            aria-label={t('options.imageRemove')}
            onClick={() => onChange('')}
          >
            <CloseRounded />
          </IconButton>
        )}
      </Stack>
      {open && (
        <DrawingGrid
          value={value}
          onPick={name => {
            onChange(name)
            setOpen(false)
          }}
        />
      )}
    </Field>
  )
}

DrawingPicker.propTypes = {
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string,
}

const toggle = (list, name, on) =>
  on
    ? [...new Set([...(list || []), name])]
    : (list || []).filter(s => s !== name)

// MoreOptions folds away what a card rarely needs, open when it holds some.
export const MoreOptions = ({ children, start }) => {
  const { t } = useTranslation('learn')
  const [open, setOpen] = useState(!!start)
  const id = useId()
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'lg',
        overflow: 'hidden',
      }}
    >
      <Box
        component='button'
        type='button'
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(v => !v)}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1.25,
          cursor: 'pointer',
          '&:focus-visible': { outline: '2px solid', outlineOffset: -2 },
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography level='title-sm'>{t('options.more')}</Typography>
          {!open && (
            <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
              {t('options.moreHint')}
            </Typography>
          )}
        </Box>
        {open ? <ExpandLess /> : <ExpandMore />}
      </Box>
      {open && (
        <Stack id={id} gap={2} sx={{ px: 1.5, pb: 1.5 }}>
          {children}
        </Stack>
      )}
    </Box>
  )
}

MoreOptions.propTypes = {
  children: PropTypes.node,
  start: PropTypes.bool,
}

// CardOptionFields edits the options of a card of a type. traps are the
// wrong answers it proposes, each with the reason why it is wrong; hidden
// lists the options the editor shows elsewhere.
export const CardOptionFields = ({
  extras,
  hidden = [],
  instructionHelp,
  onChange,
  traps = [],
  type,
}) => {
  const { t } = useTranslation('learn')
  const has = name =>
    (OPTIONS[type] || []).includes(name) && !hidden.includes(name)
  const set = (name, value) => onChange({ ...extras, [name]: value })
  const senses = extras.sens || []
  return (
    <>
      {has('way') && (
        <Field label={t('options.way')}>
          <Select
            value={wayOf(senses)}
            onChange={(_, next) =>
              next &&
              set(
                'sens',
                next === 'both'
                  ? ['direct', 'inverse']
                  : next === 'inverse'
                    ? ['inverse']
                    : ['direct'],
              )
            }
          >
            {WAYS.map(way => (
              <Option key={way} value={way}>
                {t(`options.ways.${way}`)}
              </Option>
            ))}
          </Select>
        </Field>
      )}
      {has('listening') && (
        <Field label={t('options.listening')} help={t('options.listeningHelp')}>
          <Stack gap={0.75}>
            {LISTENING.map(sense => (
              <Checkbox
                key={sense}
                label={t(`options.listen.${sense}`)}
                checked={senses.includes(sense)}
                // A listening card is asked at least one way.
                disabled={senses.length === 1 && senses[0] === sense}
                onChange={e =>
                  set('sens', toggle(senses, sense, e.target.checked))
                }
              />
            ))}
          </Stack>
        </Field>
      )}
      {has('zoneWays') && (
        <Field label={t('options.zoneWays')}>
          <Stack gap={0.75}>
            {ZONE_WAYS.map(sense => (
              <Checkbox
                key={sense}
                label={t(`options.zone.${sense}`)}
                checked={!senses.length || senses.includes(sense)}
                onChange={e => {
                  const now = senses.length ? senses : ZONE_WAYS
                  set('sens', toggle(now, sense, e.target.checked))
                }}
              />
            ))}
          </Stack>
        </Field>
      )}
      {has('consigne') && (
        <Field
          label={t('options.instruction')}
          help={instructionHelp || t('options.instructionHelp')}
        >
          <Input
            value={extras.consigne || ''}
            onChange={e => set('consigne', e.target.value)}
          />
        </Field>
      )}
      {has('explication') && (
        <Field
          label={t('options.explanation')}
          help={t('options.explanationHelp')}
        >
          <Textarea
            minRows={2}
            value={extras.explication || ''}
            onChange={e => set('explication', e.target.value)}
          />
        </Field>
      )}
      {has('image') && (
        <DrawingPicker
          value={extras.image || ''}
          onChange={value => set('image', value)}
        />
      )}
      {has('question_inverse') &&
        extras.image &&
        senses.includes('inverse') && (
          <Field label={t('options.drawingQuestion')}>
            <Input
              value={extras.question_inverse || ''}
              placeholder={t('options.drawingQuestionHelp')}
              onChange={e => set('question_inverse', e.target.value)}
            />
          </Field>
        )}
      {has('question_toucher') && (
        <Field label={t('options.touchQuestion')}>
          <Input
            value={extras.question_toucher || ''}
            placeholder={t('options.touchQuestionHelp')}
            onChange={e => set('question_toucher', e.target.value)}
          />
        </Field>
      )}
      {has('pourquoi') && (
        <Field label={t('options.why')} help={t('options.whyHelp')}>
          {traps.length ? (
            <Stack gap={1}>
              {traps.map(trap => (
                <Input
                  key={trap}
                  startDecorator={
                    <Typography level='body-sm' noWrap sx={{ maxWidth: 140 }}>
                      {trap}
                    </Typography>
                  }
                  aria-label={t('options.whyOf', { trap })}
                  value={extras.pourquoi?.[trap] || ''}
                  onChange={e =>
                    set('pourquoi', {
                      ...(extras.pourquoi || {}),
                      [trap]: e.target.value,
                    })
                  }
                />
              ))}
            </Stack>
          ) : (
            <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
              {t('options.whyFirst')}
            </Typography>
          )}
        </Field>
      )}
    </>
  )
}

CardOptionFields.propTypes = {
  extras: PropTypes.object.isRequired,
  hidden: PropTypes.array,
  instructionHelp: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  traps: PropTypes.array,
  type: PropTypes.string.isRequired,
}
