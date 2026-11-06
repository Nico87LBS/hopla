import {
  ChevronRightRounded,
  DownloadDoneRounded,
  FileDownloadRounded,
  OutlinedFlagRounded,
  TuneRounded,
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
import PropTypes from 'prop-types'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import ModalActions from '../../components/common/ModalActions'
import PageTabs from '../../components/common/PageTabs'
import { HOPLA } from '../../constants/theme'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import {
  useInstallModule,
  useLearnCatalogue,
  useLearnModules,
  usePlayer,
  useSetSetting,
} from '../../queries/LearnQueries'
import { useNotification } from '../../service/NotificationProvider'
import { REVIEW_BONUS, REVIEW_MAX } from '../../utils/learn/engine'
import { levelsIn, matches, sortItems } from '../../utils/learn/listing'
import { packTree } from '../../utils/learn/tree'
import LoadingComponent from '../components/Loading'
import { MemberAvatar, surfaceSx } from '../Games/GameParts'
import { ParentPage, useMembers } from '../Manage/ParentPages'
import RecreSettingsCard from '../Recre/RecreSettings'
import RecreTrialCard from '../Recre/RecreTrial'
import FamilyPacksCard from './FamilyPacks'
import { LearnIcon } from './LearnParts'
import { VoicesCard } from './LearnVoices'
import ListBar, { useListChoices } from './ListBar'
import useExportReports from './useExportReports'

const HEAD = 40

// FAMILY is whom the family's settings are saved for.
export const FAMILY = 0

export const isSet = value => value !== null && value !== undefined

export const useNotify = () => {
  const { showNotification } = useNotification()
  return (type, message) => showNotification({ type, message })
}

export const FIELDS = {
  total: { name: 'totalCap', label: 'manage.total' },
  cap: { name: 'dailyCap', label: 'manage.cap', own: 'plafond_jour' },
  capEach: { name: 'dailyCap', label: 'manage.capEach', own: 'plafond_jour' },
  unlock: { name: 'unlockPercent', label: 'manage.unlock' },
  questions: {
    name: 'questions',
    label: 'manage.questions',
    own: 'questions_par_partie',
  },
  threshold: { name: 'threshold', label: 'manage.threshold', own: 'seuil' },
  hopsByStar: {
    name: 'hopsByStar',
    label: 'manage.hopsByStar',
    own: 'hops_par_etoile',
  },
  retention: {
    name: 'retention',
    label: 'manage.retention',
    own: 'memorisation',
  },
  maxInterval: {
    name: 'maxInterval',
    label: 'manage.maxInterval',
    own: 'intervalle_max',
  },
  newPerDay: {
    name: 'newPerDay',
    label: 'manage.newPerDay',
    own: 'nouvelles_par_jour',
  },
  reviewBonus: { name: 'reviewBonus', label: 'manage.reviewBonus' },
  reviewMax: { name: 'reviewMax', label: 'manage.reviewMax' },
}

const GAME_FIELDS = [
  'questions',
  'threshold',
  'hopsByStar',
  'newPerDay',
  'retention',
  'maxInterval',
]
export const PACK_FIELDS = [...GAME_FIELDS, 'capEach', 'unlock']
export const MODULE_FIELDS = [...GAME_FIELDS, 'cap', 'unlock']

// The chips of what applies to a module, coloured by where it comes from:
// the module itself, the family or the person.
const CHIPS = [
  ['questions', 'chips.questions'],
  ['threshold', 'chips.threshold'],
  ['hopsByStar', 'chips.hopsByStar'],
  ['newPerDay', 'chips.newPerDay'],
  ['retention', 'chips.retention'],
  ['maxInterval', 'chips.maxInterval'],
  ['dailyCap', 'chips.dailyCap'],
  ['unlockPercent', 'chips.unlock'],
]

const chipSx = from =>
  from === 'person'
    ? { bgcolor: HOPLA.violet, color: '#fff', fontWeight: 600 }
    : from === 'family'
      ? {
          bgcolor: HOPLA.violetSoft,
          border: '1px solid',
          borderColor: 'rgba(91, 79, 224, .35)',
          color: HOPLA.blueberry,
        }
      : {
          bgcolor: 'background.level1',
          border: '1px solid',
          borderColor: 'divider',
          color: 'text.secondary',
        }

const SettingChip = ({ from, label }) => (
  <Typography
    component='span'
    level='body-xs'
    sx={{ borderRadius: 10, px: 1.25, py: 0.4, ...chipSx(from) }}
  >
    {label}
  </Typography>
)

SettingChip.propTypes = {
  from: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
}

// The columns at the right of a row: two icons and the box, the same width
// on every row so they line up.
const ICON = 36
const Slot = ({ children }) => (
  <Box
    sx={{
      alignItems: 'center',
      display: 'flex',
      justifyContent: 'center',
      width: ICON,
      flexShrink: 0,
    }}
  >
    {children}
  </Box>
)

Slot.propTypes = { children: PropTypes.node }

// What a row of settings holds, as chips: only what is set on it.
export const OwnChips = ({ from, row }) => {
  const { t } = useTranslation('learn')
  const set = CHIPS.filter(([name]) => isSet(row?.[name]))
  if (!set.length) return null
  return (
    <Stack direction='row' gap={0.75} flexWrap='wrap'>
      {set.map(([name, label]) => (
        <SettingChip
          key={name}
          from={from}
          label={t(label, { count: row[name], value: row[name] })}
        />
      ))}
    </Stack>
  )
}

OwnChips.propTypes = {
  from: PropTypes.string.isRequired,
  row: PropTypes.object,
}

// SettingsModal sets the hops of a day, how well a chapter must be known to
// open the next and the games, for the family or for the people ticked at
// the top. Only the fields changed are sent; an empty field takes the
// setting from above, shown in grey.
export const SettingsModal = ({
  candidates,
  current,
  fields,
  help,
  initialPeople,
  onClose,
  placeholder,
  save,
  title,
}) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const notify = useNotify()
  const family = !candidates
  const [saving, setSaving] = useState(false)
  const [chosen, setChosen] = useState(() => new Set(initialPeople))
  const [edited, setEdited] = useState({})
  const people = family
    ? [{ userId: 0 }]
    : candidates.filter(m => chosen.has(m.userId))

  const shown = field => {
    if (field in edited) return { value: edited[field] }
    const values = people.map(m => current(m.userId)?.[FIELDS[field].name])
    const first = values[0]
    if (values.every(v => v === first)) {
      return { value: isSet(first) ? String(first) : '' }
    }
    return {
      value: '',
      different: people
        .map((m, i) => `${m.displayName} ${isSet(values[i]) ? values[i] : '–'}`)
        .join(', '),
    }
  }

  const toggle = userId =>
    setChosen(old => {
      const next = new Set(old)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })

  const send = async () => {
    setSaving(true)
    try {
      const change = {}
      for (const [field, value] of Object.entries(edited)) {
        change[FIELDS[field].name] = value === '' ? -1 : Number(value)
      }
      if (Object.keys(change).length) {
        for (const member of people) await save(member.userId, change)
        notify('success', t('manage.saved'))
      }
      onClose()
    } catch (err) {
      notify('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={title}
      footer={
        <ModalActions
          secondary={{ label: t('manage.cancel'), onClick: onClose }}
          primary={{
            label: family
              ? t('manage.save')
              : t('manage.saveFor', { count: people.length }),
            onClick: send,
            loading: saving,
            disabled: people.length === 0,
          }}
        />
      }
    >
      <Stack gap={2}>
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          {help}
        </Typography>
        {!family && (
          <Stack gap={1}>
            <Typography level='title-sm'>{t('manage.forWho')}</Typography>
            <Stack direction='row' gap={1} alignItems='center' flexWrap='wrap'>
              {candidates.map(member => {
                const on = chosen.has(member.userId)
                return (
                  <IconButton
                    key={member.userId}
                    aria-pressed={on}
                    aria-label={member.displayName}
                    title={member.displayName}
                    onClick={() => toggle(member.userId)}
                    sx={{
                      border: '3px solid',
                      borderColor: on ? HOPLA.violet : 'transparent',
                      borderRadius: '50%',
                      opacity: on ? 1 : 0.5,
                      p: '2px',
                    }}
                  >
                    <MemberAvatar member={member} size={HEAD} />
                  </IconButton>
                )
              })}
            </Stack>
            {people.length === 0 && (
              <Typography level='body-sm' color='warning'>
                {t('manage.settingsNobody')}
              </Typography>
            )}
          </Stack>
        )}
        <Box
          sx={{
            alignItems: 'end',
            display: 'grid',
            gap: 1.25,
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          }}
        >
          {fields.map(field => {
            const { different, value } = shown(field)
            return (
              <Box key={field} sx={{ minWidth: 0 }}>
                <Typography level='body-xs'>
                  {t(FIELDS[field].label)}
                </Typography>
                <Input
                  value={value}
                  onChange={e =>
                    setEdited(old => ({
                      ...old,
                      [field]: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  placeholder={
                    different
                      ? t('manage.different', { values: different })
                      : people[0]
                        ? placeholder(people[0].userId, field)
                        : ''
                  }
                  title={different || undefined}
                  color={field in edited ? 'primary' : 'neutral'}
                  slotProps={{ input: { inputMode: 'numeric' } }}
                />
              </Box>
            )
          })}
        </Box>
      </Stack>
    </ResponsiveModal>
  )
}

SettingsModal.propTypes = {
  candidates: PropTypes.array,
  current: PropTypes.func.isRequired,
  fields: PropTypes.arrayOf(PropTypes.oneOf(Object.keys(FIELDS))).isRequired,
  help: PropTypes.string.isRequired,
  initialPeople: PropTypes.array,
  onClose: PropTypes.func.isRequired,
  placeholder: PropTypes.func.isRequired,
  save: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
}

// PersonPicker chooses whose games and settings the page shows.
const PersonPicker = ({ members, onPick, person }) => (
  <Box
    sx={{
      display: 'grid',
      gap: 1,
      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    }}
  >
    {members.map(member => {
      const on = member.userId === person?.userId
      return (
        <Button
          key={member.userId}
          variant={on ? 'soft' : 'outlined'}
          color={on ? 'primary' : 'neutral'}
          aria-pressed={on}
          onClick={() => onPick(member.userId)}
          startDecorator={<MemberAvatar member={member} size={30} />}
          sx={{
            borderRadius: 'lg',
            borderWidth: on ? 2 : 1,
            justifyContent: 'flex-start',
            minHeight: 52,
          }}
        >
          <Typography level='title-sm' noWrap sx={{ color: 'inherit' }}>
            {member.displayName}
          </Typography>
        </Button>
      )
    })}
  </Box>
)

PersonPicker.propTypes = {
  members: PropTypes.array.isRequired,
  onPick: PropTypes.func.isRequired,
  person: PropTypes.object,
}

// TotalCard shows the cap of a whole day of learning games for a person.
const TotalCard = ({ onOpen, person, total }) => {
  const { t } = useTranslation('learn')
  return (
    <Sheet sx={{ ...surfaceSx, display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flex: 1 }}>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('manage.totalOf', { name: person.displayName })}
        </Typography>
        <Typography level='title-md'>
          {isSet(total)
            ? t('manage.totalShort', { count: total })
            : t('manage.noTotal')}
        </Typography>
      </Box>
      <IconButton
        variant='soft'
        color='primary'
        aria-label={t('manage.totalSettings', { name: person.displayName })}
        onClick={onOpen}
      >
        <TuneRounded />
      </IconButton>
    </Sheet>
  )
}

TotalCard.propTypes = {
  onOpen: PropTypes.func.isRequired,
  person: PropTypes.object.isRequired,
  total: PropTypes.number,
}

// ReviewsCard shows a person's reviews of the day: the most questions due
// reviewed in a day, and the bonus for reviewing them all.
const ReviewsCard = ({ onOpen, person, setting }) => {
  const { t } = useTranslation('learn')
  return (
    <Sheet sx={{ ...surfaceSx, display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flex: 1 }}>
        <Typography level='title-md'>{t('manage.reviews')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('manage.reviewsShort', {
            most: setting?.reviewMax ?? REVIEW_MAX,
            bonus: setting?.reviewBonus ?? REVIEW_BONUS,
          })}
        </Typography>
      </Box>
      <IconButton
        variant='soft'
        color='primary'
        aria-label={t('manage.reviewsFor', { name: person.displayName })}
        onClick={onOpen}
      >
        <TuneRounded />
      </IconButton>
    </Sheet>
  )
}

ReviewsCard.propTypes = {
  onOpen: PropTypes.func.isRequired,
  person: PropTypes.object.isRequired,
  setting: PropTypes.object,
}

// VOICES are what the device can say aloud for a person: everything, only
// the instructions, or nothing.
const VOICES = ['tout', 'consigne', 'rien']

// ReadAloudCard chooses, for one person, what the voice of the device says
// in the modules made to be read aloud.
const ReadAloudCard = ({ person, setting }) => {
  const { t } = useTranslation('learn')
  const setSetting = useSetSetting()
  const notify = useNotify()
  const value =
    setting?.voice || (setting?.readAloud === false ? 'rien' : 'tout')
  const change = async voice => {
    try {
      await setSetting.mutateAsync({ userId: person.userId, scope: '*', voice })
    } catch (err) {
      notify('error', err.message)
    }
  }
  return (
    <Sheet sx={{ ...surfaceSx }}>
      <Box>
        <Typography level='title-md'>{t('manage.readAloud')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('manage.readAloudHelp')}
        </Typography>
      </Box>
      <Select
        size='sm'
        value={value}
        disabled={setSetting.isPending}
        onChange={(_, voice) => voice && voice !== value && change(voice)}
        slotProps={{
          button: {
            'aria-label': t('manage.readAloudFor', {
              name: person.displayName,
            }),
          },
        }}
        sx={{ mt: 1, width: 'fit-content' }}
      >
        {VOICES.map(voice => (
          <Option key={voice} value={voice}>
            {t(`manage.voice.${voice}`)}
          </Option>
        ))}
      </Select>
    </Sheet>
  )
}

ReadAloudCard.propTypes = {
  person: PropTypes.object.isRequired,
  setting: PropTypes.object,
}

// GRADINGS are how a person's right answers are graded: by their account
// (buttons for a parent, the time for a child), by the time taken, or by the
// buttons Difficile and Facile.
const GRADINGS = ['compte', 'auto', 'boutons']

// GradingCard chooses, for one person, how their right answers are graded.
const GradingCard = ({ person, setting }) => {
  const { t } = useTranslation('learn')
  const setSetting = useSetSetting()
  const notify = useNotify()
  const value = setting?.grading || 'compte'
  const change = async grading => {
    try {
      await setSetting.mutateAsync({
        userId: person.userId,
        scope: '*',
        grading: grading === 'compte' ? '' : grading,
      })
    } catch (err) {
      notify('error', err.message)
    }
  }
  return (
    <Sheet sx={{ ...surfaceSx }}>
      <Box>
        <Typography level='title-md'>{t('manage.grading')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('manage.gradingHelp')}
        </Typography>
      </Box>
      <Select
        size='sm'
        value={value}
        disabled={setSetting.isPending}
        onChange={(_, next) => next && next !== value && change(next)}
        slotProps={{
          button: {
            'aria-label': t('manage.gradingFor', {
              name: person.displayName,
            }),
          },
        }}
        sx={{ mt: 1, width: 'fit-content' }}
      >
        {GRADINGS.map(grading => (
          <Option key={grading} value={grading}>
            {t(`manage.gradings.${grading}`)}
          </Option>
        ))}
      </Select>
    </Sheet>
  )
}

GradingCard.propTypes = {
  person: PropTypes.object.isRequired,
  setting: PropTypes.object,
}

// FirstNameCard sets the first name the games call a person by, in the
// questions about it; empty, the first word of their name in Hopla.
const FirstNameCard = ({ person, value }) => {
  const { t } = useTranslation('learn')
  const setSetting = useSetSetting()
  const notify = useNotify()
  const [name, setName] = useState(value || '')
  const fallback = (person.displayName || '').split(/\s+/)[0]
  const changed = name.trim() !== (value || '')
  const save = async () => {
    try {
      await setSetting.mutateAsync({
        userId: person.userId,
        scope: '*',
        firstName: name.trim(),
      })
      notify('success', t('manage.saved'))
    } catch (err) {
      notify('error', err.message)
    }
  }
  return (
    <Sheet sx={{ ...surfaceSx, display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level='title-md'>{t('manage.firstName')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('manage.firstNameHelp')}
        </Typography>
        <Input
          size='sm'
          value={name}
          placeholder={fallback}
          onChange={e => setName(e.target.value.slice(0, 20))}
          onKeyDown={e => e.key === 'Enter' && changed && save()}
          sx={{ mt: 1, maxWidth: 240 }}
          slotProps={{
            input: {
              'aria-label': t('manage.firstNameFor', {
                name: person.displayName,
              }),
            },
          }}
        />
      </Box>
      {changed && (
        <Button size='sm' loading={setSetting.isPending} onClick={save}>
          {t('manage.save')}
        </Button>
      )}
    </Sheet>
  )
}

FirstNameCard.propTypes = {
  person: PropTypes.object.isRequired,
  value: PropTypes.string,
}

// FamilySettings sets what holds for everyone on a pack or a module, unless
// they have their own.
export const FamilySettings = ({ defaults, entry, onClose, settings }) => {
  const { t } = useTranslation('learn')
  const setSetting = useSetSetting()
  return (
    <SettingsModal
      title={t('manage.familyTitle', { name: entry.name })}
      help={t('manage.familyHelp')}
      fields={entry.children?.length ? PACK_FIELDS : MODULE_FIELDS}
      current={() => settings.get(`${FAMILY}:${entry.id}`)}
      placeholder={(_, field) => {
        const own = FIELDS[field].own
        const value = own && defaults[entry.id]?.[own]
        return isSet(value)
          ? t('manage.fromModule', { value })
          : t('manage.moduleOwn')
      }}
      save={(_, change) =>
        setSetting.mutateAsync({ family: true, scope: entry.id, ...change })
      }
      onClose={onClose}
    />
  )
}

FamilySettings.propTypes = {
  defaults: PropTypes.object.isRequired,
  entry: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  settings: PropTypes.instanceOf(Map).isRequired,
}

// CatalogueCard lists the modules that come with Hopla. An installed one has
// the settings of the whole family, which hold for everyone who has none.
const CatalogueCard = ({ defaults, installed, settings }) => {
  const { t } = useTranslation('learn')
  const { data: catalogue = [] } = useLearnCatalogue()
  const install = useInstallModule()
  const notify = useNotify()
  const [settingsFor, setSettingsFor] = useState(null)
  // A module of a pack is installed with its pack.
  const inPacks = new Set(catalogue.flatMap(entry => entry.children || []))
  const all = catalogue.filter(entry => !inPacks.has(entry.id))
  const [query, setQuery] = useState('')
  const [choices, setChoices] = useListChoices('hopla.learn.list.catalogue', {
    filters: [],
    levels: [],
    sort: 'level',
  })
  const checks = {
    installed: entry => installed.has(entry.id),
    notInstalled: entry => !installed.has(entry.id),
  }
  const names = new Map(catalogue.map(entry => [entry.id, entry.name]))
  const byId = new Map(catalogue.map(entry => [entry.id, entry]))
  // The levels of a pack of levels; 0 for a pack with a single level.
  const levelCount = entry =>
    (entry.children || []).filter(id => byId.get(id)?.children?.length).length
  // Searching a pack finds it by the names of its levels and their modules.
  const namesIn = entry =>
    (entry.children || []).flatMap(id => [
      names.get(id),
      ...(byId.get(id)?.children || []).map(child => names.get(child)),
    ])
  const shown = sortItems(
    all.filter(
      entry =>
        matches(query, entry.name, entry.description, ...namesIn(entry)) &&
        (!choices.levels?.length ||
          (entry.levels || []).some(l => choices.levels.includes(l))) &&
        (choices.filters || []).every(f => !checks[f] || checks[f](entry)),
    ),
    choices.sort,
  )

  const add = async entry => {
    try {
      await install.mutateAsync(entry.id)
      notify('success', t('manage.installed', { name: entry.name }))
    } catch (err) {
      notify('error', err.message)
    }
  }

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg'>{t('manage.catalogue')}</Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('manage.catalogueHelp')}
      </Typography>
      <ListBar
        query={query}
        onQuery={setQuery}
        choices={choices}
        onChoices={setChoices}
        count={shown.length}
        filters={[
          ['installed', ['notInstalled']],
          ['notInstalled', ['installed']],
        ].map(([key, exclusive]) => ({
          key,
          exclusive,
          label: t(`list.filter.${key}`),
          count: all.filter(checks[key]).length,
        }))}
        levels={levelsIn(all)}
        sorts={['level', 'name'].map(key => ({
          key,
          label: t(`list.sort.${key}`),
        }))}
      />
      {shown.length === 0 && (
        <Typography level='body-md' sx={{ color: 'text.secondary' }}>
          {t('list.nothing')}
        </Typography>
      )}
      <Stack gap={1}>
        {shown.map(entry => (
          <Sheet
            key={entry.id}
            variant='outlined'
            sx={{ borderRadius: 'lg', p: 1.5 }}
          >
            <Stack direction='row' gap={1.5} alignItems='flex-start'>
              <LearnIcon entity={entry} size={44} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack
                  direction='row'
                  gap={0.75}
                  alignItems='center'
                  flexWrap='wrap'
                >
                  <Typography
                    level='title-md'
                    component={Link}
                    to={`/manage/learn/detail/${entry.id}`}
                    sx={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {entry.name}
                  </Typography>
                  {(entry.levels || []).map(level => (
                    <Chip key={level} size='sm' variant='soft'>
                      {level}
                    </Chip>
                  ))}
                </Stack>
                <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
                  {entry.description}
                </Typography>
                {entry.author && (
                  <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                    {t('manage.by', { author: entry.author })}
                  </Typography>
                )}
                <Typography
                  level='body-xs'
                  component={Link}
                  to={`/manage/learn/detail/${entry.id}`}
                  endDecorator={<ChevronRightRounded />}
                  sx={{ color: HOPLA.violet, fontWeight: 600, mt: 0.5 }}
                >
                  {levelCount(entry) > 0
                    ? t('manage.seeLevels', { count: levelCount(entry) })
                    : entry.children?.length > 0
                      ? t('manage.seeModules', { count: entry.children.length })
                      : t('manage.seeDetail')}
                </Typography>
              </Box>
              {installed.has(entry.id) ? (
                <Stack direction='row' gap={0.5} alignItems='center'>
                  <Chip
                    color='success'
                    variant='soft'
                    startDecorator={<DownloadDoneRounded />}
                  >
                    {t('manage.isInstalled')}
                  </Chip>
                  <IconButton
                    variant='soft'
                    color='primary'
                    aria-label={t('manage.familySettings', {
                      name: entry.name,
                    })}
                    onClick={() => setSettingsFor(entry)}
                  >
                    <TuneRounded />
                  </IconButton>
                </Stack>
              ) : (
                <Button
                  size='sm'
                  onClick={() => add(entry)}
                  loading={install.isPending}
                >
                  {t('manage.install')}
                </Button>
              )}
            </Stack>
            {installed.has(entry.id) && (
              <Box sx={{ mt: 1 }}>
                <OwnChips
                  from='family'
                  row={settings.get(`${FAMILY}:${entry.id}`)}
                />
              </Box>
            )}
          </Sheet>
        ))}
      </Stack>
      {settingsFor && (
        <FamilySettings
          entry={settingsFor}
          defaults={defaults}
          settings={settings}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </Sheet>
  )
}

CatalogueCard.propTypes = {
  defaults: PropTypes.object.isRequired,
  installed: PropTypes.instanceOf(Set).isRequired,
  settings: PropTypes.instanceOf(Map).isRequired,
}

// /manage/learn: the modules of the family, who plays them and the settings
// of each person.
// useExportReports sends the questions reported in the games, in one file,
// to whoever writes the modules.

// ReportsCard leads to the questions reported in the games.
const ReportsCard = ({ count }) => {
  const { t } = useTranslation('learn')
  const notify = useNotify()
  const [exportAll, busy] = useExportReports()
  return (
    <Sheet sx={surfaceSx}>
      <Stack direction='row' gap={1.5} alignItems='center' flexWrap='wrap'>
        <OutlinedFlagRounded sx={{ color: HOPLA.carrotText }} />
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography level='title-md'>
            {t('reports.title', { count })}
          </Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('reports.help')}
          </Typography>
        </Box>
        <Button
          variant='soft'
          color='neutral'
          startDecorator={<FileDownloadRounded />}
          loading={busy}
          onClick={() => exportAll().catch(err => notify('error', err.message))}
        >
          {t('reports.export')}
        </Button>
        <Button component={Link} to='/manage/learn/signalements'>
          {t('reports.open')}
        </Button>
      </Stack>
    </Sheet>
  )
}

ReportsCard.propTypes = { count: PropTypes.number.isRequired }

// LearnTabs switches between the settings of each person and the
// catalogue, shared by the whole family.
const TABS = [
  { value: 'packs', to: '/manage/learn' },
  { value: 'people', to: '/manage/learn/personnes' },
  { value: 'catalogue', to: '/manage/learn/catalogue' },
  { value: 'voices', to: '/manage/learn/voix' },
]

const LearnTabs = ({ current }) => {
  const { t } = useTranslation('learn')
  return (
    <PageTabs
      current={current}
      tabs={TABS.map(tab => ({ ...tab, label: t(`manage.tabs.${tab.value}`) }))}
    />
  )
}

LearnTabs.propTypes = {
  current: PropTypes.oneOf(['packs', 'people', 'catalogue', 'voices']),
}

// packEntries are the packs of the family, each with its levels, then the
// modules no pack gathers: a pack the family wrote is one of these, a pack of
// one level.
export const packEntries = modules => {
  const tree = packTree(modules)
  const out = tree.groups.map(({ levels, pack }) => ({
    id: pack.id,
    pack,
    levels,
    modules: levels.flatMap(level => level.modules),
  }))
  for (const module of tree.others) {
    out.push({
      id: module.id,
      pack: module,
      levels: [{ pack: null, modules: [module] }],
      modules: [module],
    })
  }
  return out
}

// A person plays a pack when one of its modules is on for them.
const playersOf = (entry, members, activations) =>
  members.filter(member =>
    entry.modules.some(module =>
      activations.has(`${member.userId}:${module.id}`),
    ),
  )

// PackRow is a pack of the list: its name, its levels, who plays it.
const PackRow = ({ entry, members, reported }) => {
  const { t } = useTranslation('learn')
  const { pack } = entry
  const levels = pack.levels?.length ? pack.levels : levelsIn(entry.modules)
  return (
    <Sheet
      sx={{
        ...surfaceSx,
        color: 'inherit',
        textDecoration: 'none',
        '&:hover': { borderColor: HOPLA.violet },
      }}
      component={Link}
      to={`/manage/learn/paquet/${pack.id}`}
    >
      <Stack direction='row' alignItems='center' gap={1.25}>
        <LearnIcon entity={pack} size={32} tile={false} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-md'>{pack.name}</Typography>
          <Stack direction='row' gap={0.5} flexWrap='wrap' sx={{ mt: 0.25 }}>
            {levels.map(level => (
              <Chip key={level} size='sm' variant='soft'>
                {level}
              </Chip>
            ))}
            {pack.author && (
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {t('manage.by', { author: pack.author })}
              </Typography>
            )}
            {reported > 0 && (
              <Chip
                size='sm'
                variant='soft'
                color='warning'
                startDecorator={<OutlinedFlagRounded />}
              >
                {t('detail.reports', { count: reported })}
              </Chip>
            )}
          </Stack>
        </Box>
        <Stack direction='row' gap={0.5}>
          {members.map(member => (
            <MemberAvatar key={member.userId} member={member} size={30} />
          ))}
        </Stack>
        <ChevronRightRounded sx={{ color: 'text.tertiary' }} />
      </Stack>
    </Sheet>
  )
}

PackRow.propTypes = {
  entry: PropTypes.object.isRequired,
  members: PropTypes.array.isRequired,
  reported: PropTypes.number,
}

// /manage/learn: the packs of the family, with who plays each one. A pack
// has its own page.
export const ManageLearn = () => {
  const { t } = useTranslation('learn')
  const members = useMembers()
  const { data, isLoading } = useLearnModules()
  const modules = useMemo(() => data?.modules || [], [data?.modules])
  const activations = useMemo(
    () =>
      new Map(
        (data?.activations || []).map(a => [`${a.userId}:${a.module}`, a]),
      ),
    [data?.activations],
  )
  const entries = useMemo(() => packEntries(modules), [modules])
  const reportCount = Object.values(data?.reports || {}).reduce(
    (n, c) => n + c,
    0,
  )
  const [query, setQuery] = useState('')
  const shown = entries.filter(entry =>
    entry.pack.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <ParentPage page='learn'>
      <LearnTabs current='packs' />
      {isLoading && <LoadingComponent />}
      {reportCount > 0 && <ReportsCard count={reportCount} />}
      {!isLoading && entries.length === 0 && (
        <Sheet sx={surfaceSx}>
          <Typography level='title-md'>{t('manage.none')}</Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('manage.noneHelp')}
          </Typography>
          <Button
            component={Link}
            to='/manage/learn/catalogue'
            sx={{ alignSelf: 'start', mt: 1 }}
          >
            {t('manage.tabs.catalogue')}
          </Button>
        </Sheet>
      )}
      {entries.length > 6 && (
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('manage.searchPack')}
          slotProps={{ input: { 'aria-label': t('manage.searchPack') } }}
        />
      )}
      {shown.map(entry => {
        const reported = entry.modules.reduce(
          (n, m) => n + (data?.reports?.[m.id] || 0),
          0,
        )
        return (
          <PackRow
            key={entry.id}
            entry={entry}
            members={playersOf(entry, members, activations)}
            reported={reported}
          />
        )
      })}
      {!isLoading && entries.length > 0 && (
        <Stack direction='row' gap={1} flexWrap='wrap'>
          <Button
            component={Link}
            to='/manage/learn/editeur/nouveau'
            variant='soft'
          >
            {t('manage.createPack')}
          </Button>
          <Button
            component={Link}
            to='/manage/learn/catalogue'
            variant='outlined'
          >
            {t('manage.addPack')}
          </Button>
        </Stack>
      )}
    </ParentPage>
  )
}

// /manage/learn/personnes: what holds for a person whatever the pack: the
// hops of a day, the reviews, the voice, the grading, their first name.
export const LearnPeople = () => {
  const { t } = useTranslation('learn')
  const members = useMembers()
  const { data, isLoading } = useLearnModules()
  const setSetting = useSetSetting()
  const [personId, setPersonId] = useState(null)
  const [settingsFor, setSettingsFor] = useState(null)
  const person = members.find(m => m.userId === personId) || members[0]
  const settings = useMemo(
    () =>
      new Map((data?.settings || []).map(s => [`${s.userId}:${s.scope}`, s])),
    [data?.settings],
  )
  const { data: player } = usePlayer(person?.userId)

  const modal = () => {
    if (!settingsFor) return null
    const close = () => setSettingsFor(null)
    const common = { initialPeople: [person.userId], onClose: close }
    if (settingsFor === 'total') {
      return (
        <SettingsModal
          {...common}
          title={t('manage.total')}
          help={t('manage.totalHelp')}
          fields={['total']}
          candidates={members}
          current={userId => settings.get(`${userId}:*`)}
          placeholder={() => t('manage.noTotalShort')}
          save={(userId, change) =>
            setSetting.mutateAsync({ userId, scope: '*', ...change })
          }
        />
      )
    }
    return (
      <SettingsModal
        {...common}
        title={t('manage.reviews')}
        help={t('manage.reviewsHelp')}
        fields={['reviewMax', 'reviewBonus']}
        candidates={members}
        current={userId => settings.get(`${userId}:*`)}
        placeholder={(userId, field) => {
          const family = settings.get(`${FAMILY}:*`)?.[FIELDS[field].name]
          if (isSet(family)) return t('manage.fromFamily', { value: family })
          return t('manage.byDefault', {
            value: field === 'reviewMax' ? REVIEW_MAX : REVIEW_BONUS,
          })
        }}
        save={(userId, change) =>
          setSetting.mutateAsync({ userId, scope: '*', ...change })
        }
      />
    )
  }

  return (
    <ParentPage page='learn'>
      <LearnTabs current='people' />
      {isLoading && <LoadingComponent />}
      {person && (
        <Fragment>
          <PersonPicker
            members={members}
            person={person}
            onPick={setPersonId}
          />
          <TotalCard
            person={person}
            total={settings.get(`${person.userId}:*`)?.totalCap}
            onOpen={() => setSettingsFor('total')}
          />
          <ReviewsCard
            person={person}
            setting={settings.get(`${person.userId}:*`)}
            onOpen={() => setSettingsFor('reviews')}
          />
          <ReadAloudCard
            person={person}
            setting={settings.get(`${person.userId}:*`)}
          />
          <GradingCard
            person={person}
            setting={settings.get(`${person.userId}:*`)}
          />
          <FirstNameCard
            key={person.userId}
            person={person}
            value={settings.get(`${person.userId}:*`)?.firstName}
          />
          <RecreSettingsCard person={person} recre={player?.recre} />
          <RecreTrialCard person={person} recre={player?.recre} />
        </Fragment>
      )}
      {modal()}
    </ParentPage>
  )
}

// /manage/learn/catalogue: the packs the family writes or receives, then
// those that come with Hopla, for the whole family.
export const LearnCatalogue = () => {
  const { data } = useLearnModules()
  const modules = data?.modules || []
  const settings = useMemo(
    () =>
      new Map((data?.settings || []).map(s => [`${s.userId}:${s.scope}`, s])),
    [data?.settings],
  )
  return (
    <ParentPage page='learn'>
      <LearnTabs current='catalogue' />
      <FamilyPacksCard modules={modules} />
      <CatalogueCard
        installed={new Set(modules.map(m => m.id))}
        defaults={data?.defaults || {}}
        settings={settings}
      />
    </ParentPage>
  )
}

// /manage/learn/voix: the voice of this device for the questions read
// aloud; each device keeps its own.
export const LearnVoices = () => (
  <ParentPage page='learn'>
    <LearnTabs current='voices' />
    <VoicesCard />
  </ParentPage>
)

export default ManageLearn
