import {
  AddRounded,
  CheckRounded,
  DeleteOutlineRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Input,
  Option,
  Select,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLearnModuleFile } from '../../queries/LearnQueries'
import {
  cleanPrereqs,
  COLORS,
  defaultOf,
  GAME_SETTINGS,
  LANGUAGES,
  READ_ALOUD,
  READ_BACK,
  readAloudOf,
  readAloudValue,
  readBackOf,
  withGameSetting,
  withRest,
  WRITINGS,
} from '../../utils/learn/packOptions'
import { MoreOptions } from './CardOptions'

const Field = ({ children, help, label }) => {
  const id = useId()
  return (
    <Box>
      <Typography
        level='title-sm'
        component='label'
        htmlFor={id}
        sx={{ mb: 0.5, display: 'block' }}
      >
        {label}
      </Typography>
      {children(id)}
      {help && (
        <Typography level='body-xs' sx={{ color: 'text.tertiary', mt: 0.5 }}>
          {help}
        </Typography>
      )}
    </Box>
  )
}

Field.propTypes = {
  children: PropTypes.func.isRequired,
  help: PropTypes.node,
  label: PropTypes.node.isRequired,
}

const Choice = ({ help, label, onChange, options, value }) => (
  <Field label={label} help={help}>
    {id => (
      <Select
        slotProps={{ button: { id } }}
        value={value}
        onChange={(_, next) => next != null && onChange(next)}
      >
        {options.map(([key, text]) => (
          <Option key={key} value={key}>
            {text}
          </Option>
        ))}
      </Select>
    )}
  </Field>
)

Choice.propTypes = {
  help: PropTypes.node,
  label: PropTypes.node.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired,
  value: PropTypes.string.isRequired,
}

// PrereqRow is a module, and maybe one of its chapters, to know well enough
// before the pack opens.
const PrereqRow = ({ modules, onChange, onRemove, row }) => {
  const { t } = useTranslation('learn')
  const file = useLearnModuleFile(row.module)
  let chapters = []
  try {
    chapters = file.data ? JSON.parse(file.data).chapitres || [] : []
  } catch {
    chapters = []
  }
  return (
    <Stack
      gap={0.75}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'md',
        p: 1,
      }}
    >
      <Stack direction='row' gap={0.75} alignItems='center'>
        <Select
          size='sm'
          sx={{ flex: 1, minWidth: 0 }}
          aria-label={t('packOptions.prereqModule')}
          placeholder={t('packOptions.prereqModule')}
          value={row.module || null}
          onChange={(_, module) =>
            onChange({ ...row, module: module || '', chapitre: '' })
          }
        >
          {modules.map(module => (
            <Option key={module.id} value={module.id}>
              {module.name}
            </Option>
          ))}
        </Select>
        <IconButton
          size='sm'
          variant='plain'
          color='neutral'
          aria-label={t('packOptions.prereqRemove')}
          onClick={onRemove}
        >
          <DeleteOutlineRounded />
        </IconButton>
      </Stack>
      <Stack direction='row' gap={0.75} alignItems='center'>
        <Select
          size='sm'
          sx={{ flex: 1, minWidth: 0 }}
          aria-label={t('packOptions.prereqChapter')}
          value={row.chapitre || ''}
          disabled={!row.module}
          onChange={(_, chapitre) =>
            onChange({ ...row, chapitre: chapitre || '' })
          }
        >
          <Option value=''>{t('packOptions.prereqWhole')}</Option>
          {chapters.map(chapter => (
            <Option key={chapter.id} value={chapter.id}>
              {chapter.nom}
            </Option>
          ))}
        </Select>
        <Input
          size='sm'
          type='number'
          aria-label={t('packOptions.prereqPercent')}
          value={row.pourcent}
          endDecorator='%'
          slotProps={{ input: { min: 0, max: 100 } }}
          onChange={e => onChange({ ...row, pourcent: e.target.value })}
          sx={{ width: 96 }}
        />
      </Stack>
    </Stack>
  )
}

PrereqRow.propTypes = {
  modules: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  row: PropTypes.object.isRequired,
}

// hasPackOptions tells whether a pack holds settings of its own, to show
// them unfolded.
const hasPackOptions = rest =>
  [
    'description',
    'auteur',
    'ecriture',
    'couleur',
    'relire_reponse',
    'prerequis',
    'reglages',
  ].some(name => rest[name] !== undefined)

// PackOptions edits what a pack holds beside its chapters: its description,
// its author, how it is said and written, what must be known before it, and
// the settings of its games.
const PackOptions = ({ audience, modules, onChange, rest, selfId }) => {
  const { t } = useTranslation('learn')
  const set = (name, value) => onChange(withRest(rest, name, value))
  const [prereqs, setPrereqs] = useState(() =>
    (rest.prerequis || []).map(p => ({
      module: p.module || '',
      chapitre: p.chapitre || '',
      pourcent: p.pourcent ?? 80,
    })),
  )
  const changePrereqs = rows => {
    setPrereqs(rows)
    set('prerequis', cleanPrereqs(rows))
  }
  const others = modules.filter(module => module.id !== selfId)
  const language = rest.langue || 'fr'
  return (
    <MoreOptions start={hasPackOptions(rest)} hint={t('packOptions.hint')}>
      <Field label={t('packOptions.description')}>
        {id => (
          <Textarea
            slotProps={{ textarea: { id } }}
            minRows={2}
            value={rest.description || ''}
            placeholder={t('packOptions.descriptionHint')}
            onChange={e => set('description', e.target.value)}
          />
        )}
      </Field>
      <Field label={t('packOptions.author')}>
        {id => (
          <Input
            slotProps={{ input: { id } }}
            value={rest.auteur || ''}
            onChange={e => set('auteur', e.target.value)}
          />
        )}
      </Field>
      <Choice
        label={t('packOptions.language')}
        value={language}
        options={LANGUAGES.map(l => [l, t(`packOptions.languages.${l}`)])}
        onChange={value => set('langue', value)}
      />
      <Choice
        label={t('packOptions.taught')}
        help={t('packOptions.taughtHelp')}
        value={rest.langue_apprise || ''}
        options={[
          ['', t('packOptions.taughtSame')],
          ...LANGUAGES.map(l => [l, t(`packOptions.languages.${l}`)]),
        ]}
        onChange={value => set('langue_apprise', value)}
      />
      <Choice
        label={t('packOptions.readAloud')}
        value={readAloudOf(rest, audience)}
        options={READ_ALOUD.map(r => [r, t(`packOptions.readAlouds.${r}`)])}
        onChange={value => set('lecture_voix_haute', readAloudValue(value))}
      />
      <Choice
        label={t('packOptions.readBack')}
        value={readBackOf(rest)}
        options={READ_BACK.map(r => [r, t(`packOptions.readBacks.${r}`)])}
        onChange={value =>
          set(
            'relire_reponse',
            value === 'oui' ? true : value === 'non' ? false : undefined,
          )
        }
      />
      <Choice
        label={t('packOptions.writing')}
        value={rest.ecriture || 'imprimerie'}
        options={WRITINGS.map(w => [w, t(`packOptions.writings.${w}`)])}
        onChange={value =>
          set('ecriture', value === 'imprimerie' ? undefined : value)
        }
      />
      <Field label={t('packOptions.color')} help={t('packOptions.colorHelp')}>
        {() => (
          <Stack direction='row' gap={0.75} flexWrap='wrap'>
            <Button
              size='sm'
              variant={rest.couleur ? 'outlined' : 'soft'}
              color='neutral'
              onClick={() => set('couleur', undefined)}
            >
              {t('packOptions.colorAuto')}
            </Button>
            {COLORS.map(color => (
              <IconButton
                key={color}
                size='sm'
                aria-label={color}
                aria-pressed={rest.couleur === color}
                onClick={() => set('couleur', color)}
                sx={{
                  color: '#fff',
                  borderRadius: '50%',
                  '&, &:hover, &:active, &[aria-pressed="true"]': {
                    bgcolor: color,
                    color: '#fff',
                  },
                  '&:hover': { opacity: 0.85 },
                  ...(rest.couleur === color && {
                    outline: '2px solid',
                    outlineColor: color,
                    outlineOffset: '2px',
                  }),
                }}
              >
                {rest.couleur === color && <CheckRounded />}
              </IconButton>
            ))}
          </Stack>
        )}
      </Field>
      <Box>
        <Typography level='title-sm'>{t('packOptions.prereqs')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.tertiary', mb: 0.75 }}>
          {t('packOptions.prereqsHelp')}
        </Typography>
        <Stack gap={1}>
          {prereqs.map((row, index) => (
            <PrereqRow
              key={index}
              row={row}
              modules={others}
              onChange={next =>
                changePrereqs(prereqs.map((r, i) => (i === index ? next : r)))
              }
              onRemove={() =>
                changePrereqs(prereqs.filter((_, i) => i !== index))
              }
            />
          ))}
          <Button
            size='sm'
            variant='plain'
            startDecorator={<AddRounded />}
            sx={{ alignSelf: 'flex-start' }}
            onClick={() =>
              setPrereqs([
                ...prereqs,
                { module: '', chapitre: '', pourcent: 80 },
              ])
            }
          >
            {t('packOptions.prereqAdd')}
          </Button>
        </Stack>
      </Box>
      <Box>
        <Typography level='title-sm'>{t('packOptions.game')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.tertiary', mb: 0.75 }}>
          {t('packOptions.gameHelp')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 1,
          }}
        >
          {GAME_SETTINGS.map(([name, min, max]) => (
            <Field key={name} label={t(`packOptions.games.${name}`)}>
              {id => (
                <Input
                  size='sm'
                  type='number'
                  slotProps={{ input: { id, min, max } }}
                  placeholder={String(defaultOf(name))}
                  value={rest.reglages?.[name] ?? ''}
                  onChange={e =>
                    onChange(withGameSetting(rest, name, e.target.value, false))
                  }
                  onBlur={e =>
                    onChange(withGameSetting(rest, name, e.target.value))
                  }
                />
              )}
            </Field>
          ))}
        </Box>
      </Box>
    </MoreOptions>
  )
}

PackOptions.propTypes = {
  audience: PropTypes.string.isRequired,
  modules: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  rest: PropTypes.object.isRequired,
  selfId: PropTypes.string,
}

export default PackOptions
