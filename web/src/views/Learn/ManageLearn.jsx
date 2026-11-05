import {
  ChevronRightRounded,
  DeleteOutlineRounded,
  DownloadDoneRounded,
  ExpandLessRounded,
  ExpandMoreRounded,
  FactCheckOutlined,
  FileDownloadRounded,
  InsightsRounded,
  OutlinedFlagRounded,
  SchoolRounded,
  TuneRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Checkbox,
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
  useRemoveModule,
  useSetActivation,
  useSetAside,
  useSetPackPlayer,
  useSetPlacementKeep,
  useSetSetting,
} from '../../queries/LearnQueries'
import { useNotification } from '../../service/NotificationProvider'
import { ExportLearnReports } from '../../utils/Fetcher'
import {
  moduleProgress,
  REVIEW_BONUS,
  REVIEW_MAX,
} from '../../utils/learn/engine'
import {
  isRecent,
  levelsIn,
  matches,
  shape,
  sortItems,
} from '../../utils/learn/listing'
import { packsAbove, packTree } from '../../utils/learn/tree'
import { saveFile } from '../../utils/saveFile'
import LoadingComponent from '../components/Loading'
import { MemberAvatar, surfaceSx } from '../Games/GameParts'
import { ParentPage, useMembers } from '../Manage/ParentPages'
import RecreSettingsCard from '../Recre/RecreSettings'
import RecreTrialCard from '../Recre/RecreTrial'
import FamilyPacksCard from './FamilyPacks'
import { LearnIcon, useCompiled } from './LearnParts'
import { VoicesCard } from './LearnVoices'
import ListBar, { useListChoices } from './ListBar'
import RemoveModal from './RemoveModal'

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

// AppliedChips shows the settings of a module that differ from its pack's
// line, or, outside a pack, those not the module's own.
const AppliedChips = ({ applied, baseline }) => {
  const { t } = useTranslation('learn')
  if (!applied) return null
  const shown = CHIPS.filter(([name]) => {
    const { from, value } = applied[name] || {}
    if (!isSet(value)) return false
    return baseline ? baseline[name]?.value !== value : from !== 'module'
  })
  if (!shown.length) return null
  return (
    <Stack direction='row' gap={0.75} flexWrap='wrap'>
      {shown.map(([name, label]) => (
        <SettingChip
          key={name}
          from={applied[name].from}
          label={t(label, {
            count: applied[name].value,
            value: applied[name].value,
          })}
        />
      ))}
    </Stack>
  )
}

AppliedChips.propTypes = {
  applied: PropTypes.object,
  baseline: PropTypes.object,
}

// The module's own name of each setting, in its document.
const OWN = {
  questions: 'questions_par_partie',
  threshold: 'seuil',
  hopsByStar: 'hops_par_etoile',
  newPerDay: 'nouvelles_par_jour',
  retention: 'memorisation',
  maxInterval: 'intervalle_max',
  dailyCap: 'plafond_jour',
}

// packLine is what a pack, or a level then its pack, sets for a person:
// theirs, else the family's, else what all its modules share. scopes are the
// packs, the nearest first.
const packLine = (scopes, modules, person, settings, defaults) => {
  const first = (userId, name) => {
    for (const scope of scopes) {
      const value = settings.get(`${userId}:${scope}`)?.[name]
      if (isSet(value)) return value
    }
    return null
  }
  const line = {}
  for (const [name] of CHIPS) {
    const mine = first(person.userId, name)
    const family = first(FAMILY, name)
    if (isSet(mine)) line[name] = { value: mine, from: 'person' }
    else if (isSet(family)) line[name] = { value: family, from: 'family' }
    else if (OWN[name]) {
      const values = modules.map(m => defaults[m.id]?.[OWN[name]])
      if (isSet(values[0]) && values.every(v => v === values[0]))
        line[name] = { value: values[0], from: 'module' }
    }
  }
  return line
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

const Legend = ({ person }) => {
  const { t } = useTranslation('learn')
  return (
    <Stack direction='row' gap={1.5} flexWrap='wrap'>
      {[
        ['module', t('legend.module')],
        ['family', t('legend.family')],
        ['person', t('legend.person', { name: person.displayName })],
      ].map(([from, label]) => (
        <Stack key={from} direction='row' gap={0.75} alignItems='center'>
          <Box
            sx={{ borderRadius: 1, height: 14, width: 14, ...chipSx(from) }}
          />
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

Legend.propTypes = { person: PropTypes.object.isRequired }

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

// LevelRow is a level of a pack for one person: its name, its settings and
// the box of all its modules.
const LevelRow = ({
  baseline,
  group,
  member,
  onAccess,
  onSettings,
  person,
  section,
}) => {
  const { t } = useTranslation('learn')
  const { access, level, line, open } = section
  // Only what is set on the level for the person or the family, other
  // than on its pack.
  const chips = CHIPS.filter(
    ([name]) =>
      line[name] &&
      line[name].from !== 'module' &&
      line[name].value !== baseline?.[name]?.value,
  )
  return (
    <Stack
      gap={0.75}
      sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.25 }}
    >
      <Stack direction='row' alignItems='center' gap={1}>
        <Typography
          level='title-md'
          component={Link}
          to={`/manage/learn/detail/${group.pack.id}`}
          startDecorator={<LearnIcon entity={level} size={22} tile={false} />}
          sx={{
            color: 'inherit',
            flex: 1,
            minWidth: 0,
            pl: 4,
            textDecoration: 'none',
          }}
        >
          {level.name}
        </Typography>
        <Slot />
        <Slot>
          <IconButton
            size='sm'
            variant='plain'
            color='primary'
            aria-label={t('manage.levelSettings', { name: level.name })}
            onClick={() => onSettings(level)}
          >
            <TuneRounded />
          </IconButton>
        </Slot>
        <Slot>
          <Select
            size='sm'
            disabled={!member}
            value={access}
            onChange={(_, value) => value && onAccess(level.id, value)}
            slotProps={{
              button: {
                'aria-label': `${level.name} · ${person.displayName}`,
              },
            }}
            sx={{ minWidth: 154 }}
          >
            <Option value='auto'>{t('manage.accessAuto')}</Option>
            <Option value='open'>{t('manage.accessOpen')}</Option>
            <Option value='locked'>{t('manage.accessLocked')}</Option>
          </Select>
        </Slot>
      </Stack>
      {!open && access === 'auto' && (
        <Typography level='body-xs' sx={{ color: 'text.tertiary', pl: 4 }}>
          {t('manage.levelClosed')}
        </Typography>
      )}
      {chips.length > 0 && (
        <Stack direction='row' gap={0.75} flexWrap='wrap' sx={{ pl: 4 }}>
          {chips.map(([key, label]) => (
            <SettingChip
              key={key}
              from={line[key].from}
              label={t(label, {
                count: line[key].value,
                value: line[key].value,
              })}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}

LevelRow.propTypes = {
  onAccess: PropTypes.func.isRequired,
  baseline: PropTypes.object,
  group: PropTypes.object.isRequired,
  onSettings: PropTypes.func.isRequired,
  member: PropTypes.object,
  person: PropTypes.object.isRequired,
  section: PropTypes.object.isRequired,
}

// PlacementBox tells a person's placement test in a pack: when it was done
// and the level reached, what it keeps on, and the test to do again.
const PlacementBox = ({ group, person, placement }) => {
  const { i18n, t } = useTranslation('learn')
  const setKeep = useSetPlacementKeep()
  const notify = useNotify()
  const levels = (group.tiers || []).filter(level => level.pack)
  const reached = levels.find(level => level.pack.id === placement?.reached)
  const done = placement?.status === 'done'
  const day = done
    ? new Date(placement.doneAt).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
      })
    : ''
  const change = async keep => {
    try {
      await setKeep.mutateAsync({
        userId: person.userId,
        pack: group.pack.id,
        keep,
      })
    } catch (err) {
      notify('error', err.message)
    }
  }
  return (
    <Sheet
      variant='soft'
      sx={{ borderRadius: 'lg', display: 'grid', gap: 1, mt: 1.5, p: 1.5 }}
    >
      <Stack direction='row' alignItems='center' gap={1}>
        <FactCheckOutlined
          sx={{ color: done ? HOPLA.green : 'text.tertiary' }}
        />
        <Typography level='body-sm' sx={{ flex: 1, minWidth: 0 }}>
          {!placement
            ? t('manage.testNone')
            : !done
              ? t('manage.testSkipped')
              : reached
                ? t('manage.testDoneAt', { day, level: reached.pack.name })
                : t('manage.testDone', { day })}
        </Typography>
        <Button
          size='sm'
          variant='outlined'
          component={Link}
          to={`/learn/${person.userId}/test/${group.pack.id}`}
        >
          {placement ? t('test.again') : t('test.button')}
        </Button>
      </Stack>
      {done && reached && levels[0].pack.id !== reached.pack.id && (
        <Stack gap={0.5}>
          <Typography
            id={`keep-${person.userId}-${group.pack.id}`}
            level='body-xs'
            sx={{ color: 'text.secondary', fontWeight: 600 }}
          >
            {t('manage.testKeep')}
          </Typography>
          <Select
            value={placement.keep || ''}
            onChange={(e, value) => value !== null && change(value)}
            slotProps={{
              button: {
                'aria-labelledby': `keep-${person.userId}-${group.pack.id}`,
              },
            }}
          >
            <Option value=''>{t('manage.testKeepUpTo')}</Option>
            <Option value='only'>{t('manage.testKeepOnly')}</Option>
          </Select>
        </Stack>
      )}
    </Sheet>
  )
}

PlacementBox.propTypes = {
  group: PropTypes.object.isRequired,
  person: PropTypes.object.isRequired,
  placement: PropTypes.object,
}

// One installed pack, or the modules outside any pack, for one person: the
// pack's settings on one line under its name, then each module with only
// the settings of its own, and at the right the box of who plays it.
const ModuleGroup = ({
  activations,
  applied,
  defaults,
  group,
  onPackSettings,
  onRemove,
  onSettings,
  packPlayers,
  person,
  placements,
  reports,
  settings,
}) => {
  const { t } = useTranslation('learn')
  const setActivation = useSetActivation()
  const setPack = useSetPackPlayer()
  const setAside = useSetAside()
  const notify = useNotify()
  // A pack is folded at first, to keep the page short.
  const [unfolded, setUnfolded] = useState(false)
  const isOn = id => activations.has(`${person.userId}:${id}`)
  // A module a pack gained in an update, which nobody plays yet.
  const playedBy = new Set([...activations.keys()].map(k => k.split(':')[1]))
  const isNew = module =>
    group.pack &&
    !playedBy.has(module.id) &&
    new Date(module.installedAt) > new Date(group.pack.installedAt)

  const toggle = async (ids, active) => {
    try {
      await setActivation.mutateAsync({
        userId: person.userId,
        modules: ids,
        active,
      })
    } catch (err) {
      notify('error', err.message)
    }
  }

  const run = async promise => {
    try {
      await promise
    } catch (err) {
      notify('error', err.message)
    }
  }
  // The pack is ticked, not its levels: they open by themselves, and a
  // parent can only set aside what is open.
  const member = group.pack
    ? (packPlayers || []).find(
        p => p.userId === person.userId && p.pack === group.pack.id,
      )
    : null
  const asideKeys = new Set(
    (member?.excluded || []).filter(key => !key.startsWith('force-open:')),
  )
  const forcedKeys = new Set(
    (member?.excluded || [])
      .filter(key => key.startsWith('force-open:'))
      .map(key => key.slice('force-open:'.length)),
  )
  const tiers = (group.tiers || []).filter(level => level.pack)
  const singleLevel =
    !!group.pack && tiers.length === 0 && group.modules.length > 0
  const singleAccess = forcedKeys.has(group.pack?.id)
    ? 'open'
    : asideKeys.has(group.pack?.id)
      ? 'locked'
      : 'auto'
  const onAside = (key, aside) =>
    run(
      setAside.mutateAsync({
        userId: person.userId,
        pack: group.pack.id,
        key,
        aside,
      }),
    )
  const onAccess = (key, mode) =>
    run(
      setAside.mutateAsync({
        userId: person.userId,
        pack: group.pack.id,
        key,
        mode,
      }),
    )

  const ids = group.modules.map(m => m.id)
  const on = ids.filter(isOn).length
  const reported = ids.reduce((n, id) => n + (reports?.[id] || 0), 0)
  const line = group.pack
    ? packLine([group.pack.id], group.modules, person, settings, defaults)
    : null
  const lineChips = line ? CHIPS.filter(([name]) => line[name]) : []
  // A pack of levels shows each level with its modules; a pack with a single
  // level shows its modules alone.
  const sections = (group.tiers || [])
    .filter(level => level.pack)
    .map(level => {
      const own = new Set(level.modules.map(m => m.id))
      const modules = group.modules.filter(m => own.has(m.id))
      return {
        level: level.pack,
        modules,
        partial: modules.length < level.modules.length,
        line: packLine(
          [level.pack.id, group.pack.id],
          modules,
          person,
          settings,
          defaults,
        ),
      }
    })
    .filter(section => section.modules.length)
  const indent = sections.length ? 6 : 4
  const placement = group.pack
    ? (placements || []).find(
        p => p.userId === person.userId && p.pack === group.pack.id,
      )
    : null
  const openTo = Math.max(
    0,
    tiers.findIndex(level => level.pack.id === member?.openTo),
  )
  const openFrom =
    placement?.status === 'done' && placement.keep === 'only' ? openTo : 0
  const levelOpen = id => {
    const i = tiers.findIndex(level => level.pack.id === id)
    return !!member && i >= openFrom && i <= openTo
  }
  sections.forEach(section => {
    section.open = levelOpen(section.level.id)
    section.access = forcedKeys.has(section.level.id)
      ? 'open'
      : asideKeys.has(section.level.id)
        ? 'locked'
        : 'auto'
    section.aside = section.access === 'locked'
  })
  // moduleOpen tells whether a module of the pack can be played: its
  // level open and not set aside.
  const levelOf = new Map(
    sections.flatMap(section => section.modules.map(m => [m.id, section])),
  )
  const moduleOpen = module => {
    if (!group.pack) return true
    const section = levelOf.get(module.id)
    return (
      !!member &&
      (section
        ? section.access === 'open' || (section.open && !section.aside)
        : singleLevel
          ? singleAccess === 'open' || singleAccess === 'auto'
          : true)
    )
  }
  const placedIn = new Set(
    (placement?.opened || []).map(chapter => chapter.split('/')[0]),
  )
  // renderModule is the row of a module, its chips against the line above.
  const renderModule = (module, baseline) => {
    const playing = isOn(module.id)
    return (
      <Stack
        key={module.id}
        gap={0.75}
        sx={{ ...rowSx, opacity: playing ? 1 : 0.6 }}
      >
        <Stack direction='row' alignItems='center' gap={1}>
          <Box sx={{ flex: 1, minWidth: 0, pl: indent }}>
            <Typography
              level='body-md'
              startDecorator={
                <LearnIcon entity={module} size={22} tile={false} />
              }
              endDecorator={
                isNew(module) &&
                moduleOpen(module) && (
                  <Chip size='sm' variant='soft' color='success'>
                    {t('manage.new')}
                  </Chip>
                )
              }
            >
              {module.name}
            </Typography>
            {placedIn.has(module.id) && (
              <Typography
                level='body-xs'
                sx={{ color: HOPLA.greenText, fontWeight: 600 }}
              >
                {t('manage.byTest')}
              </Typography>
            )}
          </Box>
          <Slot>
            <IconButton
              size='sm'
              variant='plain'
              component={Link}
              to={`/manage/learn/${module.id}`}
              aria-label={t('manage.stats', { name: module.name })}
            >
              <InsightsRounded />
            </IconButton>
          </Slot>
          <Slot>
            {playing && (
              <IconButton
                size='sm'
                variant='plain'
                aria-label={t('manage.moduleSettings', {
                  name: module.name,
                })}
                onClick={() => onSettings(module)}
              >
                <TuneRounded />
              </IconButton>
            )}
          </Slot>
          <Slot>
            {group.pack ? (
              <Switch
                checked={playing}
                disabled={!moduleOpen(module)}
                onChange={e => onAside(module.id, !e.target.checked)}
                slotProps={{
                  input: {
                    'aria-label': `${module.name} · ${person.displayName}`,
                  },
                }}
              />
            ) : (
              <Checkbox
                checked={playing}
                onChange={e => toggle([module.id], e.target.checked)}
                slotProps={{
                  input: {
                    'aria-label': `${module.name} · ${person.displayName}`,
                  },
                }}
              />
            )}
          </Slot>
        </Stack>
        {playing && (
          <Box sx={{ pl: indent }}>
            <AppliedChips applied={applied?.[module.id]} baseline={baseline} />
          </Box>
        )}
      </Stack>
    )
  }
  const rowSx = { borderTop: '1px solid', borderColor: 'divider', pt: 1.25 }
  const name = group.pack ? group.pack.name : t('manage.others')
  return (
    <Sheet sx={surfaceSx}>
      <Stack direction='row' alignItems='flex-start' gap={1}>
        {group.pack ? (
          <LearnIcon entity={group.pack} size={32} tile={false} />
        ) : (
          <SchoolRounded sx={{ color: HOPLA.violet, mt: 0.5 }} />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {group.pack ? (
            <Stack direction='row' alignItems='center' gap={1} flexWrap='wrap'>
              <Typography
                level='title-lg'
                component={Link}
                to={`/manage/learn/detail/${group.pack.id}`}
                sx={{ color: 'inherit', textDecoration: 'none' }}
              >
                {name}
              </Typography>
              {singleLevel && (
                <Select
                  size='sm'
                  disabled={!member}
                  value={singleAccess}
                  onChange={(_, value) =>
                    value && onAccess(group.pack.id, value)
                  }
                  slotProps={{
                    button: { 'aria-label': `${name} · ${person.displayName}` },
                  }}
                  sx={{ minWidth: 154 }}
                >
                  <Option value='auto'>{t('manage.accessAuto')}</Option>
                  <Option value='open'>{t('manage.accessOpen')}</Option>
                  <Option value='locked'>{t('manage.accessLocked')}</Option>
                </Select>
              )}
            </Stack>
          ) : (
            <Typography level='title-lg'>{name}</Typography>
          )}
          {group.pack?.author && (
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
              {t('manage.by', { author: group.pack.author })}
            </Typography>
          )}
          {(group.pack?.levels?.length > 0 || reported > 0) && (
            <Stack direction='row' gap={0.5} sx={{ mt: 0.25 }} flexWrap='wrap'>
              {(group.pack?.levels || []).map(level => (
                <Chip key={level} size='sm' variant='soft'>
                  {level}
                </Chip>
              ))}
              {reported > 0 && (
                <Chip
                  size='sm'
                  variant='soft'
                  color='warning'
                  component={Link}
                  to={`/manage/learn/detail/${group.pack?.id || group.modules[0].id}`}
                  startDecorator={<OutlinedFlagRounded />}
                >
                  {t('detail.reports', { count: reported })}
                </Chip>
              )}
            </Stack>
          )}
        </Box>
        <Slot>
          {group.pack && (
            <IconButton
              size='sm'
              variant='plain'
              color='danger'
              aria-label={t('manage.remove')}
              onClick={() => onRemove(group.pack)}
            >
              <DeleteOutlineRounded />
            </IconButton>
          )}
        </Slot>
        <Slot>
          {group.pack && (
            <IconButton
              size='sm'
              variant='soft'
              color='primary'
              aria-label={t('manage.packSettings')}
              onClick={() => onPackSettings(group.pack)}
            >
              <TuneRounded />
            </IconButton>
          )}
        </Slot>
        <Slot>
          {group.pack ? (
            <Checkbox
              checked={!!member}
              onChange={e =>
                run(
                  setPack.mutateAsync({
                    userId: person.userId,
                    pack: group.pack.id,
                    on: e.target.checked,
                  }),
                )
              }
              slotProps={{
                input: { 'aria-label': `${name} · ${person.displayName}` },
              }}
            />
          ) : (
            <Checkbox
              checked={on === ids.length}
              indeterminate={on > 0 && on < ids.length}
              onChange={e => toggle(ids, e.target.checked)}
              slotProps={{
                input: { 'aria-label': `${name} · ${person.displayName}` },
              }}
            />
          )}
        </Slot>
      </Stack>
      {lineChips.length > 0 && (
        <Stack direction='row' gap={0.75} flexWrap='wrap' sx={{ mt: 1, pl: 4 }}>
          {lineChips.map(([key, label]) => (
            <SettingChip
              key={key}
              from={line[key].from}
              label={t(label, {
                count: line[key].value,
                value: line[key].value,
              })}
            />
          ))}
        </Stack>
      )}

      {group.pack && (
        <Button
          variant='plain'
          color='neutral'
          size='sm'
          onClick={() => setUnfolded(!unfolded)}
          aria-expanded={unfolded}
          endDecorator={
            unfolded ? <ExpandLessRounded /> : <ExpandMoreRounded />
          }
          sx={{ justifyContent: 'flex-start', mt: 1, pl: 4, width: '100%' }}
        >
          <Typography
            level='body-sm'
            sx={{ color: 'text.secondary', flex: 1, textAlign: 'left' }}
          >
            {!member
              ? t('manage.packOff')
              : tiers.length
                ? t('manage.packOnLevel', {
                    count: on,
                    level: tiers[openTo]?.pack.name,
                  })
                : t('manage.packOn', { count: on })}
          </Typography>
        </Button>
      )}

      {group.pack && member && unfolded && (
        <PlacementBox group={group} person={person} placement={placement} />
      )}

      <Stack
        gap={1.25}
        sx={{ mt: 1.5, display: !group.pack || unfolded ? 'flex' : 'none' }}
      >
        {sections.length
          ? sections.map(section => (
              <Fragment key={section.level.id}>
                <LevelRow
                  group={group}
                  person={person}
                  member={member}
                  section={section}
                  baseline={line}
                  onSettings={onPackSettings}
                  onAccess={onAccess}
                />
                {section.modules.map(module =>
                  renderModule(module, section.line),
                )}
              </Fragment>
            ))
          : group.modules.map(module => renderModule(module, line))}
      </Stack>
      {!group.pack && (
        <Stack direction='row' gap={1} flexWrap='wrap' sx={{ mt: 1.5 }}>
          {group.modules.map(module => (
            <Button
              key={module.id}
              size='sm'
              variant='plain'
              color='danger'
              startDecorator={<DeleteOutlineRounded />}
              onClick={() => onRemove(module)}
            >
              {module.name}
            </Button>
          ))}
        </Stack>
      )}
    </Sheet>
  )
}

ModuleGroup.propTypes = {
  activations: PropTypes.instanceOf(Map).isRequired,
  applied: PropTypes.object,
  defaults: PropTypes.object.isRequired,
  group: PropTypes.object.isRequired,
  onPackSettings: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onSettings: PropTypes.func.isRequired,
  packPlayers: PropTypes.array,
  person: PropTypes.object.isRequired,
  placements: PropTypes.array,
  reports: PropTypes.object,
  settings: PropTypes.instanceOf(Map).isRequired,
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
export const useExportReports = () => {
  const [busy, setBusy] = useState(false)
  const exportAll = async () => {
    setBusy(true)
    try {
      const reports = await ExportLearnReports()
      const now = new Date()
      const file = {
        format: 'hopla-signalements/1',
        hopla: import.meta.env.VITE_APP_VERSION,
        exportedAt: now.toISOString(),
        reports,
      }
      await saveFile(
        `hopla-signalements-${now.toISOString().slice(0, 10)}.json`,
        `${JSON.stringify(file, null, 2)}\n`,
      )
    } finally {
      setBusy(false)
    }
  }
  return [exportAll, busy]
}

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
  { value: 'people', to: '/manage/learn' },
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
  current: PropTypes.oneOf(['people', 'catalogue', 'voices']),
}

export const ManageLearn = () => {
  const { t } = useTranslation('learn')
  const members = useMembers()
  const { data, isLoading } = useLearnModules()
  const remove = useRemoveModule()
  const setActivation = useSetActivation()
  const setSetting = useSetSetting()
  const notify = useNotify()
  const [personId, setPersonId] = useState(null)
  // What the settings window is open for: { scope: 'total' | 'pack' |
  // 'module', module }.
  const [settingsFor, setSettingsFor] = useState(null)
  const [confirm, setConfirm] = useState({})

  const person = members.find(m => m.userId === personId) || members[0]
  const modules = useMemo(() => data?.modules || [], [data?.modules])
  const activations = useMemo(
    () =>
      new Map(
        (data?.activations || []).map(a => [`${a.userId}:${a.module}`, a]),
      ),
    [data?.activations],
  )
  const defaults = data?.defaults || {}
  const settings = useMemo(
    () =>
      new Map((data?.settings || []).map(s => [`${s.userId}:${s.scope}`, s])),
    [data?.settings],
  )
  const groups = useMemo(() => {
    const tree = packTree(modules)
    const out = tree.groups.map(({ levels, pack }) => ({
      pack,
      tiers: levels,
      modules: levels.flatMap(level => level.modules),
    }))
    if (tree.others.length) out.push({ pack: null, modules: tree.others })
    return out
  }, [modules])

  const reportCount = Object.values(data?.reports || {}).reduce(
    (n, c) => n + c,
    0,
  )
  const [query, setQuery] = useState('')
  const [choices, setChoices] = useListChoices('hopla.learn.list.people', {
    filters: [],
    levels: [],
    sort: 'level',
  })
  const { data: player } = usePlayer(person?.userId)
  const { byId: compiled, cards } = useCompiled(player)
  const shown = useMemo(() => {
    if (!person) return []
    const uid = person.userId
    const day = data?.day
    const last = data?.lastPlayed?.[uid] || {}
    const playedBy = new Set((data?.activations || []).map(a => a.module))
    const checks = {
      active: m => activations.has(`${uid}:${m.id}`),
      inactive: m => !activations.has(`${uid}:${m.id}`),
      fresh: (m, g) =>
        isRecent(m.installedAt, day) ||
        isRecent(m.updatedAt, day) ||
        (!!g.pack &&
          !playedBy.has(m.id) &&
          new Date(m.installedAt) > new Date(g.pack.installedAt)),
      playing: m => isRecent(last[m.id], day),
      reported: m => (data?.reports?.[m.id] || 0) > 0,
    }
    const value = (m, sort) => {
      if (sort === 'recent') return last[m.id] ?? null
      if (sort === 'progress') {
        const c = activations.has(`${uid}:${m.id}`) && compiled[m.id]
        return c ? moduleProgress(c, cards) : null
      }
      return null
    }
    const list = groups.map(g => ({
      ...g,
      name: g.pack?.name || '',
      levels: g.pack?.levels?.length ? g.pack.levels : levelsIn(g.modules),
      items: g.modules,
    }))
    const kept = shape(list, {
      query,
      levels: choices.levels,
      sort: choices.sort,
      value,
      test: (m, g) =>
        (choices.filters || []).every(f => !checks[f] || checks[f](m, g)),
    })
    const counts = {}
    for (const [key, check] of Object.entries(checks)) {
      counts[key] = list.reduce(
        (n, g) => n + g.items.filter(m => check(m, g)).length,
        0,
      )
    }
    return {
      counts,
      groups: kept.map(g => ({
        pack: g.pack,
        tiers: g.tiers,
        modules: g.items,
        partial: g.items.length < g.modules.length,
      })),
      levels: levelsIn(list.flatMap(g => [g, ...g.items])),
    }
  }, [person, data, activations, groups, query, choices, compiled, cards])

  // inherited is the setting someone gets from above, in grey: their packs,
  // then the family's module and packs, then the module itself.
  const inherited = (userId, field, moduleId) => {
    const name = FIELDS[field].name
    const packs = moduleId ? packsAbove(modules, moduleId) : []
    if (userId !== FAMILY) {
      for (const pack of packs) {
        const value = settings.get(`${userId}:${pack.id}`)?.[name]
        if (isSet(value)) return t('manage.fromPack', { value })
      }
    }
    for (const scope of [moduleId, ...packs.map(p => p.id)]) {
      const value = scope && settings.get(`${FAMILY}:${scope}`)?.[name]
      if (isSet(value)) return t('manage.fromFamily', { value })
    }
    const own = moduleId && FIELDS[field].own
    if (own && isSet(defaults[moduleId]?.[own])) {
      return t('manage.fromModule', { value: defaults[moduleId][own] })
    }
    return t('manage.moduleOwn')
  }

  const plays = module => member =>
    (module.children || [module.id]).some(id =>
      activations.has(`${member.userId}:${id}`),
    )

  const modal = () => {
    if (!settingsFor || !person) return null
    const { module, scope } = settingsFor
    const close = () => setSettingsFor(null)
    const common = { initialPeople: [person.userId], onClose: close }
    if (scope === 'total') {
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
    if (scope === 'reviews') {
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
    if (scope === 'module') {
      return (
        <SettingsModal
          {...common}
          title={module.name}
          help={t('manage.settingsHelp')}
          fields={MODULE_FIELDS}
          candidates={members.filter(plays(module))}
          current={userId => activations.get(`${userId}:${module.id}`)}
          placeholder={(userId, field) => inherited(userId, field, module.id)}
          save={(userId, change) =>
            setActivation.mutateAsync({
              userId,
              modules: [module.id],
              active: true,
              ...change,
            })
          }
        />
      )
    }
    return (
      <SettingsModal
        {...common}
        title={module.name}
        help={t('manage.packSettingsHelp')}
        fields={PACK_FIELDS}
        candidates={members}
        current={userId => settings.get(`${userId}:${module.id}`)}
        placeholder={(userId, field) => {
          // A level takes what is set on its pack.
          const name = FIELDS[field].name
          const above = packsAbove(modules, module.id)
          for (const pack of above) {
            const value = settings.get(`${userId}:${pack.id}`)?.[name]
            if (isSet(value)) return t('manage.fromPack', { value })
          }
          for (const scope of [module.id, ...above.map(p => p.id)]) {
            const value = settings.get(`${FAMILY}:${scope}`)?.[name]
            if (isSet(value)) return t('manage.fromFamily', { value })
          }
          return t('manage.moduleOwn')
        }}
        save={(userId, change) =>
          setSetting.mutateAsync({ userId, scope: module.id, ...change })
        }
      />
    )
  }

  const askRemove = module =>
    setConfirm({
      isOpen: true,
      name: module.name,
      onClose: async (ok, forget) => {
        setConfirm({})
        if (!ok) return
        try {
          await remove.mutateAsync({ id: module.id, forget })
        } catch (err) {
          notify('error', err.message)
        }
      },
    })

  return (
    <ParentPage page='learn'>
      <LearnTabs current='people' />
      {isLoading && <LoadingComponent />}
      {reportCount > 0 && <ReportsCard count={reportCount} />}
      {!isLoading && groups.length === 0 && (
        <Sheet sx={surfaceSx}>
          <Typography level='title-md'>{t('manage.none')}</Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('manage.noneHelp')}
          </Typography>
        </Sheet>
      )}
      {!isLoading && groups.length > 0 && person && (
        <Fragment>
          <PersonPicker
            members={members}
            person={person}
            onPick={setPersonId}
          />
          <TotalCard
            person={person}
            total={settings.get(`${person.userId}:*`)?.totalCap}
            onOpen={() => setSettingsFor({ scope: 'total' })}
          />
          <ReviewsCard
            person={person}
            setting={settings.get(`${person.userId}:*`)}
            onOpen={() => setSettingsFor({ scope: 'reviews' })}
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
          <Legend person={person} />
          <ListBar
            query={query}
            onQuery={setQuery}
            choices={choices}
            onChoices={setChoices}
            count={shown.groups.reduce((n, g) => n + g.modules.length, 0)}
            filters={[
              ['active', ['inactive']],
              ['inactive', ['active']],
              ['fresh'],
              ['playing'],
              ['reported'],
            ].map(([key, exclusive]) => ({
              key,
              exclusive,
              label: t(`list.filter.${key}`),
              count: shown.counts[key],
            }))}
            levels={shown.levels}
            sorts={['level', 'name', 'recent', 'progress'].map(key => ({
              key,
              label: t(`list.sort.${key}`),
            }))}
          />
          {shown.groups.length === 0 && (
            <Sheet sx={surfaceSx}>
              <Typography level='body-md' sx={{ color: 'text.secondary' }}>
                {t('list.nothing')}
              </Typography>
            </Sheet>
          )}
          {shown.groups.map(group => (
            <ModuleGroup
              key={group.pack?.id || 'others'}
              group={group}
              person={person}
              activations={activations}
              applied={data?.applied?.[person.userId]}
              defaults={defaults}
              reports={data?.reports}
              placements={data?.placements}
              packPlayers={data?.packPlayers}
              settings={settings}
              onRemove={askRemove}
              onSettings={module => setSettingsFor({ scope: 'module', module })}
              onPackSettings={module =>
                setSettingsFor({ scope: 'pack', module })
              }
            />
          ))}
        </Fragment>
      )}
      {modal()}
      {confirm.isOpen && (
        <RemoveModal name={confirm.name} onClose={confirm.onClose} />
      )}
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
