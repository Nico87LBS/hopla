import {
  ChevronRightRounded,
  DeleteOutlineRounded,
  DownloadDoneRounded,
  InsightsRounded,
  LibraryBooksRounded,
  OutlinedFlagRounded,
  SchoolRounded,
  TuneRounded,
  UploadFileRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Input,
  Sheet,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import ModalActions from '../../components/common/ModalActions'
import { HOPLA } from '../../constants/theme'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import {
  useImportModule,
  useInstallModule,
  useLearnCatalogue,
  useLearnModules,
  useRemoveModule,
  useSetActivation,
  useSetSetting,
} from '../../queries/LearnQueries'
import { useNotification } from '../../service/NotificationProvider'
import LoadingComponent from '../components/Loading'
import { MemberAvatar, surfaceSx } from '../Games/GameParts'
import { ParentPage, useMembers } from '../Manage/ParentPages'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'

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
}

const GAME_FIELDS = ['questions', 'threshold', 'hopsByStar']
export const PACK_FIELDS = [...GAME_FIELDS, 'capEach', 'unlock']
export const MODULE_FIELDS = [...GAME_FIELDS, 'cap', 'unlock']

// The chips of what applies to a module, coloured by where it comes from:
// the module itself, the family or the person.
const CHIPS = [
  ['questions', 'chips.questions'],
  ['threshold', 'chips.threshold'],
  ['hopsByStar', 'chips.hopsByStar'],
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
  dailyCap: 'plafond_jour',
}

// packLine is what a pack sets for a person: theirs, else the family's, else
// what all its modules share.
const packLine = (pack, modules, person, settings, defaults) => {
  const mine = settings.get(`${person.userId}:${pack.id}`)
  const family = settings.get(`${FAMILY}:${pack.id}`)
  const line = {}
  for (const [name] of CHIPS) {
    if (isSet(mine?.[name])) line[name] = { value: mine[name], from: 'person' }
    else if (isSet(family?.[name]))
      line[name] = { value: family[name], from: 'family' }
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
  const everyone = !family && candidates.every(m => chosen.has(m.userId))

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
              <Box sx={{ flex: 1 }} />
              <Checkbox
                label={t('manage.everyone')}
                checked={everyone}
                onChange={e =>
                  setChosen(
                    new Set(
                      e.target.checked
                        ? candidates.map(m => m.userId)
                        : initialPeople,
                    ),
                  )
                }
              />
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
  person,
  reports,
  settings,
}) => {
  const { t } = useTranslation('learn')
  const setActivation = useSetActivation()
  const notify = useNotify()
  const isOn = id => activations.has(`${person.userId}:${id}`)

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

  const ids = group.modules.map(m => m.id)
  const on = ids.filter(isOn).length
  const reported = ids.reduce((n, id) => n + (reports?.[id] || 0), 0)
  const line = group.pack
    ? packLine(group.pack, group.modules, person, settings, defaults)
    : null
  const lineChips = line ? CHIPS.filter(([name]) => line[name]) : []
  const rowSx = { borderTop: '1px solid', borderColor: 'divider', pt: 1.25 }
  const name = group.pack ? group.pack.name : t('manage.others')
  return (
    <Sheet sx={surfaceSx}>
      <Stack direction='row' alignItems='flex-start' gap={1}>
        <SchoolRounded sx={{ color: HOPLA.violet, mt: 0.5 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {group.pack ? (
            <Typography
              level='title-lg'
              component={Link}
              to={`/manage/learn/detail/${group.pack.id}`}
              sx={{ color: 'inherit', textDecoration: 'none' }}
            >
              {name}
            </Typography>
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
          <Checkbox
            checked={on === ids.length}
            indeterminate={on > 0 && on < ids.length}
            onChange={e =>
              toggle(group.pack ? [group.pack.id] : ids, e.target.checked)
            }
            slotProps={{
              input: { 'aria-label': `${name} · ${person.displayName}` },
            }}
          />
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

      <Stack gap={1.25} sx={{ mt: 1.5 }}>
        {group.modules.map(module => {
          const playing = isOn(module.id)
          return (
            <Stack
              key={module.id}
              gap={0.75}
              sx={{ ...rowSx, opacity: playing ? 1 : 0.6 }}
            >
              <Stack direction='row' alignItems='center' gap={1}>
                <Typography
                  level='body-md'
                  sx={{ flex: 1, minWidth: 0, pl: 4 }}
                >
                  {module.name}
                </Typography>
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
                  <Checkbox
                    checked={playing}
                    onChange={e => toggle([module.id], e.target.checked)}
                    slotProps={{
                      input: {
                        'aria-label': `${module.name} · ${person.displayName}`,
                      },
                    }}
                  />
                </Slot>
              </Stack>
              {playing && (
                <Box sx={{ pl: 4 }}>
                  <AppliedChips
                    applied={applied?.[module.id]}
                    baseline={line}
                  />
                </Box>
              )}
            </Stack>
          )
        })}
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
  person: PropTypes.object.isRequired,
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
  const shown = catalogue.filter(entry => !inPacks.has(entry.id))

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
      <Stack gap={1}>
        {shown.map(entry => (
          <Sheet
            key={entry.id}
            variant='outlined'
            sx={{ borderRadius: 'lg', p: 1.5 }}
          >
            <Stack direction='row' gap={1.5} alignItems='flex-start'>
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
                  {entry.children?.length > 0
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

// ImportCard takes a module written by the family, as a JSON file or text.
const ImportCard = () => {
  const { t } = useTranslation('learn')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const importModule = useImportModule()
  const notify = useNotify()

  const readFile = async e => {
    const file = e.target.files?.[0]
    if (file) setText(await file.text())
    e.target.value = ''
  }

  const send = async () => {
    setError('')
    try {
      const module = await importModule.mutateAsync(text)
      notify('success', t('manage.installed', { name: module.name }))
      setText('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg'>{t('manage.import')}</Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('manage.importHelp')}
      </Typography>
      <Textarea
        minRows={4}
        maxRows={12}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder='{ "format": "hopla-module/1", … }'
        sx={{ fontFamily: 'monospace', fontSize: 13 }}
      />
      {error && (
        <Typography level='body-sm' color='danger' sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
      <Stack direction='row' gap={1} sx={{ mt: 1.5 }}>
        <Button
          component='label'
          variant='soft'
          color='neutral'
          startDecorator={<UploadFileRounded />}
        >
          {t('manage.chooseFile')}
          <input
            type='file'
            accept='.json,application/json'
            hidden
            onChange={readFile}
          />
        </Button>
        <Button
          onClick={send}
          disabled={!text.trim()}
          loading={importModule.isPending}
        >
          {t('manage.importButton')}
        </Button>
      </Stack>
    </Sheet>
  )
}

// /manage/learn: the modules of the family, who plays them and the settings
// of each person.
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
    const byId = new Map(modules.map(m => [m.id, m]))
    const inPack = new Set()
    const out = []
    for (const pack of modules.filter(m => m.children?.length)) {
      const children = pack.children.map(id => byId.get(id)).filter(Boolean)
      children.forEach(m => inPack.add(m.id))
      out.push({ pack, modules: children })
    }
    const others = modules.filter(m => !m.children?.length && !inPack.has(m.id))
    if (others.length) out.push({ pack: null, modules: others })
    return out
  }, [modules])

  // inherited is the setting someone gets from above, in grey: their packs,
  // then the family's module and packs, then the module itself.
  const inherited = (userId, field, moduleId) => {
    const name = FIELDS[field].name
    const packs = moduleId
      ? modules.filter(m => m.children?.includes(moduleId))
      : []
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
        placeholder={(_, field) => {
          const value = settings.get(`${FAMILY}:${module.id}`)?.[
            FIELDS[field].name
          ]
          return isSet(value)
            ? t('manage.fromFamily', { value })
            : t('manage.moduleOwn')
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
      title: t('manage.removeTitle', { name: module.name }),
      message: t('manage.removeMessage'),
      confirmText: t('manage.remove'),
      cancelText: t('manage.cancel'),
      color: 'danger',
      onClose: async ok => {
        setConfirm({})
        if (!ok) return
        try {
          await remove.mutateAsync(module.id)
        } catch (err) {
          notify('error', err.message)
        }
      },
    })

  return (
    <ParentPage page='learn'>
      {isLoading && <LoadingComponent />}
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
          <Legend person={person} />
          {groups.map(group => (
            <ModuleGroup
              key={group.pack?.id || 'others'}
              group={group}
              person={person}
              activations={activations}
              applied={data?.applied?.[person.userId]}
              defaults={defaults}
              reports={data?.reports}
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
      <Button
        component={Link}
        to='/manage/learn/catalogue'
        variant='outlined'
        color='primary'
        size='lg'
        startDecorator={<LibraryBooksRounded />}
        endDecorator={<ChevronRightRounded />}
        sx={{ borderRadius: 'lg', justifyContent: 'flex-start' }}
      >
        <Box sx={{ flex: 1, textAlign: 'left' }}>
          <Typography level='title-md' sx={{ color: 'inherit' }}>
            {t('manage.openCatalogue')}
          </Typography>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {t('manage.openCatalogueHelp')}
          </Typography>
        </Box>
      </Button>
      {modal()}
      {confirm.isOpen && <ConfirmationModal config={confirm} />}
    </ParentPage>
  )
}

// /manage/learn/catalogue: the modules that come with Hopla and those the
// family imports, for the whole family.
export const LearnCatalogue = () => {
  const { data } = useLearnModules()
  const modules = data?.modules || []
  const settings = useMemo(
    () =>
      new Map((data?.settings || []).map(s => [`${s.userId}:${s.scope}`, s])),
    [data?.settings],
  )
  return (
    <ParentPage page='learnCatalogue'>
      <CatalogueCard
        installed={new Set(modules.map(m => m.id))}
        defaults={data?.defaults || {}}
        settings={settings}
      />
      <ImportCard />
    </ParentPage>
  )
}

export default ManageLearn
