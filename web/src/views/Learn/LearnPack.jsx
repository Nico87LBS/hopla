import {
  DeleteOutlineRounded,
  EditOutlined,
  Groups2Rounded,
  InsightsRounded,
  SchoolRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  Sheet,
  Stack,
  Switch,
  ToggleButtonGroup,
  Typography,
} from '@mui/joy'
import { useQuery } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import {
  useLearnModules,
  useRemoveModule,
  useSetActivation,
  useSetAside,
  useSetPackPlayer,
  useSetSetting,
} from '../../queries/LearnQueries'
import { GetPlacementTest } from '../../utils/Fetcher'
import {
  chapterAccessOf,
  creatorValue,
  levelAccessOf,
  packRows,
  packStructure,
} from '../../utils/learn/access'
import LoadingComponent from '../components/Loading'
import { MemberAvatar, surfaceSx } from '../Games/GameParts'
import { ParentPage, useMembers } from '../Manage/ParentPages'
import { LearnIcon } from './LearnParts'
import {
  FAMILY,
  FIELDS,
  isSet,
  MODULE_FIELDS,
  OwnChips,
  PACK_FIELDS,
  packEntries,
  useNotify,
} from './ManageLearn'
import RemoveModal from './RemoveModal'

// The settings a module or a level can carry of its own, by name.
const OWN_NAMES = [
  'questions',
  'threshold',
  'hopsByStar',
  'newPerDay',
  'retention',
  'maxInterval',
  'dailyCap',
  'unlockPercent',
]

// AccessSelect chooses how a level or a chapter opens: on its own with the
// tests and the progression, open or closed by a parent.
const AccessSelect = ({ label, onChange, value }) => {
  const { t } = useTranslation('learn')
  return (
    <ToggleButtonGroup
      size='sm'
      variant='outlined'
      color={
        value === 'auto' ? 'neutral' : value === 'open' ? 'success' : 'danger'
      }
      value={value}
      aria-label={label}
      onChange={(_, next) => next && next !== value && onChange(next)}
      sx={{ flexShrink: 0 }}
    >
      <Button value='auto'>{t('pack.access.auto')}</Button>
      <Button value='open'>{t('pack.access.open')}</Button>
      <Button value='locked'>{t('pack.access.locked')}</Button>
    </ToggleButtonGroup>
  )
}

AccessSelect.propTypes = {
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  value: PropTypes.oneOf(['auto', 'open', 'locked']).isRequired,
}

// ChaptersTab is the opening of a pack for one person, level by level and
// chapter by chapter.
const ChaptersTab = ({
  entry,
  packPlayer,
  person,
  placement,
  rows,
  structure,
}) => {
  const { t } = useTranslation('learn')
  const setAside = useSetAside()
  const notify = useNotify()
  const excluded = packPlayer?.excluded || []
  const placed = new Set(placement?.opened || [])
  const send = async change => {
    try {
      await setAside.mutateAsync({
        userId: person.userId,
        pack: entry.id,
        ...change,
      })
    } catch (err) {
      notify('error', err.message)
    }
  }
  const chapters = (keys, mode) => send({ chapters: keys, mode })
  const single = structure.length === 1 ? structure[0] : null
  return (
    <Stack gap={1.25}>
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('pack.chaptersHelp', { name: person.displayName })}
      </Typography>
      {single && (
        <Stack direction='row' alignItems='center' gap={1}>
          <Typography level='title-md' sx={{ flex: 1, minWidth: 0 }}>
            {t('pack.wholePack')}
          </Typography>
          <AccessSelect
            label={t('pack.wholePack')}
            value={levelAccessOf(excluded, single.id)}
            onChange={mode => send({ key: single.id, mode })}
          />
        </Stack>
      )}
      {rows.map((row, i) => {
        if (row.kind === 'level') {
          return (
            <Stack
              key={`l-${row.id}`}
              direction='row'
              alignItems='center'
              gap={1}
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                mt: 0.5,
                pt: 1.25,
              }}
            >
              <Typography level='title-md' sx={{ flex: 1, minWidth: 0 }}>
                {row.name}
              </Typography>
              <AccessSelect
                label={row.name}
                value={levelAccessOf(excluded, row.id)}
                onChange={mode => send({ key: row.id, mode })}
              />
            </Stack>
          )
        }
        if (row.kind === 'group') {
          const aside = excluded.includes(row.module)
          return (
            <Stack key={`g-${i}`} direction='row' alignItems='center' gap={1}>
              <Typography
                level='title-sm'
                sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }}
              >
                {row.name}
              </Typography>
              {aside && (
                <Chip size='sm' variant='soft' color='warning'>
                  {t('pack.aside')}
                </Chip>
              )}
              {aside && (
                <Button
                  size='sm'
                  variant='plain'
                  onClick={() => send({ key: row.module, aside: false })}
                >
                  {t('pack.takeBack')}
                </Button>
              )}
              <IconButton
                size='sm'
                variant='plain'
                component={Link}
                to={`/manage/learn/${row.module}`}
                aria-label={t('manage.stats', { name: row.name })}
              >
                <InsightsRounded />
              </IconButton>
            </Stack>
          )
        }
        const hand = chapterAccessOf(excluded, row.key)
        return (
          <Stack
            key={row.key}
            direction='row'
            alignItems='center'
            gap={1}
            sx={{ pl: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography level='body-md'>{row.chapter.nom}</Typography>
              {hand === 'auto' && placed.has(row.key) && (
                <Typography
                  level='body-xs'
                  sx={{ color: HOPLA.greenText, fontWeight: 600 }}
                >
                  {t('pack.byTest')}
                </Typography>
              )}
              {hand !== 'auto' && (
                <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                  {t(hand === 'open' ? 'pack.openedByYou' : 'pack.closedByYou')}
                </Typography>
              )}
            </Box>
            <AccessSelect
              label={row.chapter.nom}
              value={hand}
              onChange={mode => chapters([row.key], mode)}
            />
          </Stack>
        )
      })}
    </Stack>
  )
}

ChaptersTab.propTypes = {
  entry: PropTypes.object.isRequired,
  packPlayer: PropTypes.object,
  person: PropTypes.object.isRequired,
  placement: PropTypes.object,
  rows: PropTypes.array.isRequired,
  structure: PropTypes.array.isRequired,
}

// A number to type: empty takes the line to its left.
const Cell = ({ disabled, label, onSave, value }) => (
  <Input
    key={String(value)}
    disabled={disabled}
    size='sm'
    variant='outlined'
    defaultValue={isSet(value) ? String(value) : ''}
    placeholder='–'
    color={isSet(value) ? 'primary' : 'neutral'}
    onBlur={e => {
      const text = e.target.value.replace(/\D/g, '')
      if (text !== (isSet(value) ? String(value) : '')) onSave(text)
    }}
    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
    slotProps={{
      input: {
        inputMode: 'numeric',
        'aria-label': label,
        style: { textAlign: 'center' },
      },
    }}
    sx={{ '--Input-paddingInline': '4px', minWidth: 0 }}
  />
)

Cell.propTypes = {
  disabled: PropTypes.bool,
  label: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  value: PropTypes.number,
}

// SettingsTab is the settings of a pack in three layers side by side: what
// its writer chose, the family, the person. An empty box takes the layer on
// its left; the last column is what applies.
const SettingsTab = ({
  activations,
  defaults,
  entry,
  members,
  playing,
  settings,
  structure,
  who,
}) => {
  const { t } = useTranslation('learn')
  const setSetting = useSetSetting()
  const setActivation = useSetActivation()
  const notify = useNotify()
  const [showExceptions, setShowExceptions] = useState(false)
  const family = who === FAMILY
  const person = family ? null : members.find(m => m.userId === who)
  // A pack of the family is one module: its settings are the module's.
  const alone = !entry.pack.children?.length
  const keys = alone ? MODULE_FIELDS : PACK_FIELDS

  const rowOf = (scope, kind) => {
    if (family) return settings.get(`${FAMILY}:${scope}`)
    if (kind === 'module') return activations.get(`${who}:${scope}`)
    return settings.get(`${who}:${scope}`)
  }
  const write = async (scope, kind, change) => {
    try {
      if (family) {
        await setSetting.mutateAsync({ family: true, scope, ...change })
      } else if (kind === 'module') {
        await setActivation.mutateAsync({
          userId: who,
          modules: [scope],
          active: true,
          ...change,
        })
      } else {
        await setSetting.mutateAsync({ userId: who, scope, ...change })
      }
    } catch (err) {
      notify('error', err.message)
    }
  }
  const kind = alone ? 'module' : 'pack'

  const exceptions = alone
    ? []
    : [
        ...entry.levels
          .filter(level => level.pack)
          .map(level => ({
            id: level.pack.id,
            name: level.pack.name,
            kind: 'pack',
          })),
        ...entry.modules.map(module => ({
          id: module.id,
          name: module.name,
          kind: 'module',
        })),
      ].filter(item =>
        OWN_NAMES.some(name => isSet(rowOf(item.id, item.kind)?.[name])),
      )

  const columns = family ? '1.5fr 1fr 1fr 1fr' : '1.5fr 1fr 1fr 1fr 1fr'
  const head = {
    color: 'text.tertiary',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.04em',
    textAlign: 'center',
    textTransform: 'uppercase',
  }
  return (
    <Stack gap={1.25}>
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {family
          ? t('pack.settingsHelpFamily')
          : t('pack.settingsHelp', { name: person?.displayName })}
      </Typography>
      <Box
        sx={{
          alignItems: 'center',
          display: 'grid',
          gap: 0.75,
          gridTemplateColumns: columns,
        }}
      >
        <Box />
        <Typography sx={head}>{t('pack.layer.creator')}</Typography>
        <Typography sx={head}>{t('pack.layer.family')}</Typography>
        {!family && <Typography sx={head}>{person?.displayName}</Typography>}
        <Typography sx={head}>{t('pack.layer.applied')}</Typography>
        {keys.map(key => {
          const field = FIELDS[key]
          const creator = creatorValue(
            field,
            entry.modules,
            defaults,
            structure,
          )
          const own = settings.get(`${FAMILY}:${entry.id}`)?.[field.name]
          const mine = family ? null : rowOf(entry.id, kind)?.[field.name]
          const applied = isSet(mine) ? mine : isSet(own) ? own : creator
          const label = t(field.label)
          const save = text =>
            write(entry.id, kind, {
              [field.name]: text === '' ? -1 : Number(text),
            })
          return (
            <Box key={key} sx={{ display: 'contents' }}>
              <Typography level='body-sm'>{label}</Typography>
              <Typography
                level='body-sm'
                sx={{ color: 'text.tertiary', textAlign: 'center' }}
              >
                {isSet(creator) ? creator : '–'}
              </Typography>
              {family ? (
                <Cell
                  label={`${label} · ${t('pack.layer.family')}`}
                  value={own}
                  onSave={save}
                />
              ) : (
                <Typography
                  level='body-sm'
                  sx={{
                    bgcolor: isSet(own) ? HOPLA.violetSoft : 'transparent',
                    borderRadius: 'sm',
                    color: isSet(own) ? HOPLA.blueberry : 'text.tertiary',
                    fontWeight: isSet(own) ? 700 : 400,
                    py: 0.25,
                    textAlign: 'center',
                  }}
                >
                  {isSet(own) ? own : '–'}
                </Typography>
              )}
              {!family && (
                <Cell
                  disabled={alone && !playing}
                  label={`${label} · ${person?.displayName}`}
                  value={mine}
                  onSave={save}
                />
              )}
              <Typography
                level='body-sm'
                sx={{ fontWeight: 700, textAlign: 'center' }}
              >
                {isSet(applied) ? applied : '–'}
              </Typography>
            </Box>
          )
        })}
      </Box>
      <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
        {t('pack.settingsFoot')}
      </Typography>
      {exceptions.length > 0 && (
        <Stack gap={1}>
          <Stack direction='row' alignItems='center' gap={1}>
            <Typography level='title-sm' sx={{ flex: 1 }}>
              {t('pack.exceptions', { count: exceptions.length })}
            </Typography>
            <Button
              size='sm'
              variant='outlined'
              onClick={() => setShowExceptions(v => !v)}
            >
              {showExceptions ? t('pack.hide') : t('pack.see')}
            </Button>
          </Stack>
          {showExceptions &&
            exceptions.map(item => {
              const row = rowOf(item.id, item.kind)
              return (
                <Sheet
                  key={item.id}
                  variant='soft'
                  sx={{
                    borderRadius: 'lg',
                    display: 'grid',
                    gap: 0.75,
                    p: 1.25,
                  }}
                >
                  <Stack direction='row' alignItems='center' gap={1}>
                    <Typography level='title-sm' sx={{ flex: 1, minWidth: 0 }}>
                      {item.name}
                    </Typography>
                    <Button
                      size='sm'
                      variant='plain'
                      color='danger'
                      onClick={() =>
                        write(
                          item.id,
                          item.kind,
                          Object.fromEntries(
                            OWN_NAMES.filter(name => isSet(row[name])).map(
                              name => [name, -1],
                            ),
                          ),
                        )
                      }
                    >
                      {t('pack.removeException')}
                    </Button>
                  </Stack>
                  <OwnChips from={family ? 'family' : 'person'} row={row} />
                </Sheet>
              )
            })}
        </Stack>
      )}
    </Stack>
  )
}

SettingsTab.propTypes = {
  activations: PropTypes.instanceOf(Map).isRequired,
  defaults: PropTypes.object.isRequired,
  entry: PropTypes.object.isRequired,
  members: PropTypes.array.isRequired,
  playing: PropTypes.bool,
  settings: PropTypes.instanceOf(Map).isRequired,
  structure: PropTypes.array.isRequired,
  who: PropTypes.number.isRequired,
}

// WhoPicker chooses whose pack this is: the family's, or a person's. A dot
// tells who plays it.
const WhoPicker = ({ members, onPick, playing, who }) => {
  const { t } = useTranslation('learn')
  const items = [{ userId: FAMILY, displayName: t('pack.family') }, ...members]
  return (
    <Stack direction='row' gap={1.5} flexWrap='wrap'>
      {items.map(member => {
        const on = member.userId === who
        return (
          <IconButton
            key={member.userId}
            aria-pressed={on}
            aria-label={member.displayName}
            onClick={() => onPick(member.userId)}
            sx={{
              alignItems: 'center',
              flexDirection: 'column',
              gap: 0.25,
              opacity: on ? 1 : 0.65,
              p: 0.5,
            }}
          >
            <Box
              sx={{
                border: '3px solid',
                borderColor: on ? HOPLA.violet : 'transparent',
                borderRadius: '50%',
                p: '2px',
                position: 'relative',
              }}
            >
              {member.userId === FAMILY ? (
                <Box
                  sx={{
                    alignItems: 'center',
                    bgcolor: HOPLA.violetSoft,
                    border: '2px dashed',
                    borderColor: HOPLA.violet,
                    borderRadius: '50%',
                    color: HOPLA.blueberry,
                    display: 'flex',
                    height: 40,
                    justifyContent: 'center',
                    width: 40,
                  }}
                >
                  <Groups2Rounded />
                </Box>
              ) : (
                <MemberAvatar member={member} size={40} />
              )}
              {playing.has(member.userId) && (
                <Box
                  sx={{
                    bgcolor: HOPLA.green,
                    border: '2px solid',
                    borderColor: 'background.surface',
                    borderRadius: '50%',
                    bottom: -2,
                    height: 12,
                    position: 'absolute',
                    right: -2,
                    width: 12,
                  }}
                />
              )}
            </Box>
            <Typography level='body-xs' sx={{ fontWeight: on ? 700 : 400 }}>
              {member.displayName}
            </Typography>
          </IconButton>
        )
      })}
    </Stack>
  )
}

WhoPicker.propTypes = {
  members: PropTypes.array.isRequired,
  onPick: PropTypes.func.isRequired,
  playing: PropTypes.instanceOf(Set).isRequired,
  who: PropTypes.number.isRequired,
}

// /manage/learn/paquet/:packId: everything about a pack in one page, for
// the family or for one person: what is open (chapters) and the settings.
export const LearnPack = () => {
  const { packId } = useParams()
  const { t } = useTranslation('learn')
  const navigate = useNavigate()
  const members = useMembers()
  const { data, isLoading } = useLearnModules()
  const setPack = useSetPackPlayer()
  const remove = useRemoveModule()
  const notify = useNotify()
  const [chosen, setChosen] = useState(null)
  const [tab, setTab] = useState('chapters')
  const [confirm, setConfirm] = useState({})

  const modules = useMemo(() => data?.modules || [], [data?.modules])
  const entry = useMemo(
    () => packEntries(modules).find(e => e.id === packId),
    [modules, packId],
  )
  const activations = useMemo(
    () =>
      new Map(
        (data?.activations || []).map(a => [`${a.userId}:${a.module}`, a]),
      ),
    [data?.activations],
  )
  const settings = useMemo(
    () =>
      new Map((data?.settings || []).map(s => [`${s.userId}:${s.scope}`, s])),
    [data?.settings],
  )
  const who = chosen ?? members[0]?.userId ?? FAMILY
  const person = members.find(m => m.userId === who)
  const { data: test } = useQuery({
    queryKey: ['learn', 'pack', packId, entry?.pack.version],
    queryFn: () => GetPlacementTest(members[0].userId, packId),
    enabled: !!entry && members.length > 0,
    staleTime: 30000,
  })
  const structure = useMemo(() => packStructure(test), [test])
  const rows = useMemo(() => packRows(structure), [structure])

  const packPlayers = data?.packPlayers || []
  const packPlayer = packPlayers.find(
    p => p.userId === who && p.pack === packId,
  )
  const placement = (data?.placements || []).find(
    p => p.userId === who && p.pack === packId,
  )
  const playing = new Set(
    packPlayers.filter(p => p.pack === packId).map(p => p.userId),
  )

  if (isLoading) return <LoadingComponent />
  if (!entry) {
    return (
      <ParentPage page='learn'>
        <Sheet sx={surfaceSx}>
          <SchoolRounded sx={{ color: HOPLA.violet }} />
          <Typography level='title-md'>{t('pack.notFound')}</Typography>
          <Button
            component={Link}
            to='/manage/learn'
            sx={{ alignSelf: 'start' }}
          >
            {t('manage.tabs.packs')}
          </Button>
        </Sheet>
      </ParentPage>
    )
  }
  const { pack } = entry
  const editable = pack.editable || (!pack.builtin && !pack.children?.length)

  const toggle = async on => {
    try {
      await setPack.mutateAsync({ userId: who, pack: packId, on })
    } catch (err) {
      notify('error', err.message)
    }
  }
  const askRemove = () =>
    setConfirm({
      isOpen: true,
      name: pack.name,
      onClose: async (ok, forget) => {
        setConfirm({})
        if (!ok) return
        try {
          await remove.mutateAsync({ id: pack.id, forget })
          navigate('/manage/learn', { replace: true })
        } catch (err) {
          notify('error', err.message)
        }
      },
    })

  return (
    <ParentPage page='learn'>
      <Sheet sx={surfaceSx}>
        <Stack direction='row' alignItems='center' gap={1.25}>
          <LearnIcon entity={pack} size={36} tile={false} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level='title-lg'>{pack.name}</Typography>
            <Stack direction='row' gap={0.5} flexWrap='wrap'>
              {(pack.levels || []).map(level => (
                <Chip key={level} size='sm' variant='soft'>
                  {level}
                </Chip>
              ))}
              {pack.author && (
                <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                  {t('manage.by', { author: pack.author })}
                </Typography>
              )}
            </Stack>
          </Box>
          {editable && (
            <IconButton
              component={Link}
              to={`/manage/learn/editeur/${pack.id}`}
              aria-label={t('pack.editPack')}
              variant='plain'
            >
              <EditOutlined />
            </IconButton>
          )}
          {entry.modules.length === 1 && (
            <IconButton
              component={Link}
              to={`/manage/learn/${entry.modules[0].id}`}
              aria-label={t('manage.stats', { name: pack.name })}
              variant='plain'
            >
              <InsightsRounded />
            </IconButton>
          )}
          <Button
            component={Link}
            to={`/manage/learn/detail/${pack.id}`}
            size='sm'
            variant='plain'
          >
            {t('manage.seeDetail')}
          </Button>
          <IconButton
            color='danger'
            variant='plain'
            aria-label={t('manage.remove')}
            onClick={askRemove}
          >
            <DeleteOutlineRounded />
          </IconButton>
        </Stack>
        <WhoPicker
          members={members}
          onPick={setChosen}
          playing={playing}
          who={who}
        />
      </Sheet>

      {person && (
        <Sheet sx={surfaceSx}>
          <Stack direction='row' alignItems='center' gap={1.25}>
            <Typography level='title-md' sx={{ flex: 1, minWidth: 0 }}>
              {t('pack.plays', { name: person.displayName })}
            </Typography>
            <Switch
              checked={!!packPlayer}
              onChange={e => toggle(e.target.checked)}
              slotProps={{
                input: {
                  'aria-label': t('pack.plays', { name: person.displayName }),
                },
              }}
            />
          </Stack>
          <ToggleButtonGroup
            value={tab}
            variant='soft'
            onChange={(_, next) => next && setTab(next)}
            sx={{ '--ButtonGroup-flex': 1 }}
          >
            <Button value='chapters'>{t('pack.tabs.chapters')}</Button>
            <Button value='settings'>{t('pack.tabs.settings')}</Button>
          </ToggleButtonGroup>
          {tab === 'chapters' &&
            (packPlayer ? (
              <ChaptersTab
                entry={entry}
                packPlayer={packPlayer}
                person={person}
                placement={placement}
                rows={rows}
                structure={structure}
              />
            ) : (
              <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
                {t('pack.notPlaying', { name: person.displayName })}
              </Typography>
            ))}
          {tab === 'settings' && (
            <SettingsTab
              activations={activations}
              defaults={data?.defaults || {}}
              entry={entry}
              members={members}
              playing={!!packPlayer}
              settings={settings}
              structure={structure}
              who={who}
            />
          )}
        </Sheet>
      )}
      {!person && (
        <Sheet sx={surfaceSx}>
          <SettingsTab
            activations={activations}
            defaults={data?.defaults || {}}
            entry={entry}
            members={members}
            settings={settings}
            structure={structure}
            who={FAMILY}
          />
        </Sheet>
      )}
      {confirm.isOpen && (
        <RemoveModal name={confirm.name} onClose={confirm.onClose} />
      )}
    </ParentPage>
  )
}

export default LearnPack
