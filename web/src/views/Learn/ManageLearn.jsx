import {
  DeleteOutlineRounded,
  DownloadDoneRounded,
  InsightsRounded,
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

const isSet = value => value !== null && value !== undefined

const useNotify = () => {
  const { showNotification } = useNotification()
  return (type, message) => showNotification({ type, message })
}

const FIELDS = {
  total: { name: 'totalCap', label: 'manage.total' },
  cap: { name: 'dailyCap', label: 'manage.cap' },
  capEach: { name: 'dailyCap', label: 'manage.capEach' },
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

// SettingsModal sets, person by person, the hops of a day and how well a
// chapter must be known to open the next: for one module, a pack or all of
// them. An empty field takes the setting from above, shown in grey.
const SettingsModal = ({
  fields,
  help,
  initial,
  onClose,
  people,
  placeholder,
  save,
  title,
}) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const notify = useNotify()
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      people.map(m => {
        const start = initial(m.userId)
        return [
          m.userId,
          Object.fromEntries(fields.map(f => [f, start[FIELDS[f].name] ?? ''])),
        ]
      }),
    ),
  )
  const set = (userId, field, value) =>
    setValues(v => ({
      ...v,
      [userId]: { ...v[userId], [field]: value.replace(/\D/g, '') },
    }))

  const send = async () => {
    setSaving(true)
    try {
      for (const member of people) {
        const change = {}
        for (const field of fields) {
          const value = values[member.userId][field]
          change[FIELDS[field].name] = value === '' ? -1 : Number(value)
        }
        await save(member.userId, change)
      }
      notify('success', t('manage.saved'))
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
            label: t('manage.save'),
            onClick: send,
            loading: saving,
            disabled: people.length === 0,
          }}
        />
      }
    >
      {people.length === 0 ? (
        <Typography level='body-sm'>{t('manage.settingsNobody')}</Typography>
      ) : (
        <Stack gap={1.5}>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {help}
          </Typography>
          {people.map(member => (
            <Sheet
              key={member.userId}
              variant='outlined'
              sx={{ borderRadius: 'lg', p: 1.25 }}
            >
              <Stack direction='row' gap={1} alignItems='center' sx={{ mb: 1 }}>
                <MemberAvatar member={member} size={HEAD - 12} />
                <Typography level='title-sm'>{member.displayName}</Typography>
              </Stack>
              <Box
                sx={{
                  alignItems: 'end',
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
                }}
              >
                {fields.map(field => (
                  <Box key={field} sx={{ minWidth: 0 }}>
                    <Typography level='body-xs'>
                      {t(FIELDS[field].label)}
                    </Typography>
                    <Input
                      value={values[member.userId][field]}
                      onChange={e => set(member.userId, field, e.target.value)}
                      placeholder={placeholder(member.userId, field)}
                      slotProps={{ input: { inputMode: 'numeric' } }}
                    />
                  </Box>
                ))}
              </Box>
            </Sheet>
          ))}
        </Stack>
      )}
    </ResponsiveModal>
  )
}

SettingsModal.propTypes = {
  fields: PropTypes.arrayOf(PropTypes.oneOf(Object.keys(FIELDS))).isRequired,
  help: PropTypes.string.isRequired,
  initial: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  people: PropTypes.array.isRequired,
  placeholder: PropTypes.func.isRequired,
  save: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
}

// One installed pack, or the modules outside any pack: who plays which
// sub-module, with a head per person.
const ModuleGroup = ({
  activations,
  group,
  members,
  onPackSettings,
  onRemove,
  onSettings,
}) => {
  const { t } = useTranslation('learn')
  const setActivation = useSetActivation()
  const notify = useNotify()
  const isOn = (userId, id) => activations.has(`${userId}:${id}`)
  const columns = `minmax(0, 1fr) repeat(${members.length}, ${HEAD + 8}px) 72px`

  const toggle = async (userId, ids, active) => {
    try {
      await setActivation.mutateAsync({ userId, modules: ids, active })
    } catch (err) {
      notify('error', err.message)
    }
  }

  const ids = group.modules.map(m => m.id)
  return (
    <Sheet sx={surfaceSx}>
      <Stack direction='row' alignItems='center' gap={1} sx={{ mb: 1.5 }}>
        <SchoolRounded sx={{ color: HOPLA.violet }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-lg'>
            {group.pack ? group.pack.name : t('manage.others')}
          </Typography>
          {group.pack?.levels?.length > 0 && (
            <Stack direction='row' gap={0.5} sx={{ mt: 0.25 }}>
              {group.pack.levels.map(level => (
                <Chip key={level} size='sm' variant='soft'>
                  {level}
                </Chip>
              ))}
            </Stack>
          )}
        </Box>
        {group.pack && (
          <>
            <IconButton
              variant='plain'
              aria-label={t('manage.packSettings')}
              onClick={() => onPackSettings(group.pack)}
            >
              <TuneRounded />
            </IconButton>
            <IconButton
              variant='plain'
              color='danger'
              aria-label={t('manage.remove')}
              onClick={() => onRemove(group.pack)}
            >
              <DeleteOutlineRounded />
            </IconButton>
          </>
        )}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: columns,
          alignItems: 'center',
          rowGap: 1,
        }}
      >
        <Box />
        {members.map(member => (
          <Box
            key={member.userId}
            sx={{ display: 'flex', justifyContent: 'center' }}
            title={member.displayName}
          >
            <MemberAvatar member={member} size={HEAD - 8} />
          </Box>
        ))}
        <Box />

        {group.pack && (
          <>
            <Typography level='title-sm' sx={{ color: 'text.secondary' }}>
              {t('manage.wholePack')}
            </Typography>
            {members.map(member => {
              const on = ids.filter(id => isOn(member.userId, id)).length
              return (
                <Box
                  key={member.userId}
                  sx={{ display: 'flex', justifyContent: 'center' }}
                >
                  <Checkbox
                    checked={on === ids.length}
                    indeterminate={on > 0 && on < ids.length}
                    onChange={e =>
                      toggle(member.userId, [group.pack.id], e.target.checked)
                    }
                    slotProps={{
                      input: {
                        'aria-label': `${group.pack.name} · ${member.displayName}`,
                      },
                    }}
                  />
                </Box>
              )
            })}
            <Box />
          </>
        )}

        {group.modules.map(module => (
          <Fragment key={module.id}>
            <Typography level='body-sm' sx={{ pr: 1 }}>
              {module.name}
            </Typography>
            {members.map(member => (
              <Box
                key={member.userId}
                sx={{ display: 'flex', justifyContent: 'center' }}
              >
                <Checkbox
                  checked={isOn(member.userId, module.id)}
                  onChange={e =>
                    toggle(member.userId, [module.id], e.target.checked)
                  }
                  slotProps={{
                    input: {
                      'aria-label': `${module.name} · ${member.displayName}`,
                    },
                  }}
                />
              </Box>
            ))}
            <Stack direction='row'>
              <IconButton
                size='sm'
                variant='plain'
                component={Link}
                to={`/manage/learn/${module.id}`}
                aria-label={t('manage.stats', { name: module.name })}
              >
                <InsightsRounded />
              </IconButton>
              <IconButton
                size='sm'
                variant='plain'
                aria-label={t('manage.settings')}
                onClick={() => onSettings(module)}
              >
                <TuneRounded />
              </IconButton>
            </Stack>
          </Fragment>
        ))}
      </Box>
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
  group: PropTypes.object.isRequired,
  members: PropTypes.array.isRequired,
  onPackSettings: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onSettings: PropTypes.func.isRequired,
}

// AllPacksCard opens the settings that apply to every module, with the
// cap of a whole day of learning games.
const AllPacksCard = ({ members, onOpen, settings }) => {
  const { t } = useTranslation('learn')
  return (
    <Sheet sx={surfaceSx}>
      <Stack direction='row' alignItems='center' gap={1}>
        <Box sx={{ flex: 1 }}>
          <Typography level='title-lg'>{t('manage.allTitle')}</Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('manage.allHelp')}
          </Typography>
        </Box>
        <Button
          variant='soft'
          startDecorator={<TuneRounded />}
          onClick={onOpen}
        >
          {t('manage.settings')}
        </Button>
      </Stack>
      <Stack direction='row' gap={2} flexWrap='wrap' sx={{ mt: 1.5 }}>
        {members.map(member => {
          const total = settings.get(`${member.userId}:*`)?.totalCap
          return (
            <Stack
              key={member.userId}
              direction='row'
              gap={0.75}
              alignItems='center'
            >
              <MemberAvatar member={member} size={HEAD - 12} />
              <Typography level='body-sm'>
                {!isSet(total)
                  ? t('manage.noTotal')
                  : t('manage.totalShort', { count: total })}
              </Typography>
            </Stack>
          )
        })}
      </Stack>
    </Sheet>
  )
}

AllPacksCard.propTypes = {
  members: PropTypes.array.isRequired,
  onOpen: PropTypes.func.isRequired,
  settings: PropTypes.instanceOf(Map).isRequired,
}

const CatalogueCard = ({ installed }) => {
  const { t } = useTranslation('learn')
  const { data: catalogue = [] } = useLearnCatalogue()
  const install = useInstallModule()
  const notify = useNotify()
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
                  <Typography level='title-md'>{entry.name}</Typography>
                  {(entry.levels || []).map(level => (
                    <Chip key={level} size='sm' variant='soft'>
                      {level}
                    </Chip>
                  ))}
                </Stack>
                <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
                  {entry.description}
                </Typography>
                {entry.children?.length > 0 && (
                  <Typography
                    level='body-xs'
                    sx={{ color: 'text.tertiary', mt: 0.5 }}
                  >
                    {t('manage.modulesCount', { count: entry.children.length })}
                  </Typography>
                )}
              </Box>
              {installed.has(entry.id) ? (
                <Chip
                  color='success'
                  variant='soft'
                  startDecorator={<DownloadDoneRounded />}
                >
                  {t('manage.isInstalled')}
                </Chip>
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
          </Sheet>
        ))}
      </Stack>
    </Sheet>
  )
}

CatalogueCard.propTypes = { installed: PropTypes.instanceOf(Set).isRequired }

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

// /manage/learn: the modules of the family and who plays them.
export const ManageLearn = () => {
  const { t } = useTranslation('learn')
  const members = useMembers()
  const { data, isLoading } = useLearnModules()
  const remove = useRemoveModule()
  const setActivation = useSetActivation()
  const setSetting = useSetSetting()
  const notify = useNotify()
  // What the settings window is open for: { scope: 'module' | 'pack' |
  // 'all', module }.
  const [settingsFor, setSettingsFor] = useState(null)
  const [confirm, setConfirm] = useState({})

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

  // inherited is the setting a person gets from above: a module's packs,
  // then all packs.
  const inherited = (userId, field, moduleId) => {
    const name = FIELDS[field].name
    if (moduleId) {
      for (const pack of modules.filter(m => m.children?.includes(moduleId))) {
        const value = settings.get(`${userId}:${pack.id}`)?.[name]
        if (isSet(value)) return t('manage.fromPack', { value })
      }
    }
    if (settingsFor?.scope !== 'all') {
      const value = settings.get(`${userId}:*`)?.[name]
      if (isSet(value)) return t('manage.fromAll', { value })
    }
    if (field === 'total') return t('manage.noTotalShort')
    const own = moduleId && FIELDS[field].own
    if (own && isSet(defaults[moduleId]?.[own])) {
      return t('manage.fromModule', { value: defaults[moduleId][own] })
    }
    return t('manage.moduleOwn')
  }

  const modal = () => {
    if (!settingsFor) return null
    const { module, scope } = settingsFor
    const close = () => setSettingsFor(null)
    if (scope === 'module') {
      return (
        <SettingsModal
          title={module.name}
          help={t('manage.settingsHelp')}
          fields={['cap', 'unlock', ...GAME_FIELDS]}
          people={members.filter(m =>
            activations.has(`${m.userId}:${module.id}`),
          )}
          initial={userId => activations.get(`${userId}:${module.id}`)}
          placeholder={(userId, field) => inherited(userId, field, module.id)}
          save={(userId, change) =>
            setActivation.mutateAsync({
              userId,
              modules: [module.id],
              active: true,
              ...change,
            })
          }
          onClose={close}
        />
      )
    }
    const all = scope === 'all'
    const key = all ? '*' : module.id
    return (
      <SettingsModal
        title={all ? t('manage.allTitle') : module.name}
        help={all ? t('manage.allSettingsHelp') : t('manage.packSettingsHelp')}
        fields={
          all
            ? ['total', 'capEach', 'unlock', ...GAME_FIELDS]
            : ['capEach', 'unlock', ...GAME_FIELDS]
        }
        people={
          all
            ? members
            : members.filter(m =>
                module.children.some(id =>
                  activations.has(`${m.userId}:${id}`),
                ),
              )
        }
        initial={userId => settings.get(`${userId}:${key}`) || {}}
        placeholder={(userId, field) => inherited(userId, field)}
        save={(userId, change) =>
          setSetting.mutateAsync({ userId, scope: key, ...change })
        }
        onClose={close}
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
      {!isLoading && groups.length > 0 && (
        <AllPacksCard
          members={members}
          settings={settings}
          onOpen={() => setSettingsFor({ scope: 'all' })}
        />
      )}
      {groups.map(group => (
        <ModuleGroup
          key={group.pack?.id || 'others'}
          group={group}
          members={members}
          activations={activations}
          onRemove={askRemove}
          onSettings={module => setSettingsFor({ scope: 'module', module })}
          onPackSettings={module => setSettingsFor({ scope: 'pack', module })}
        />
      ))}
      <CatalogueCard installed={new Set(modules.map(m => m.id))} />
      <ImportCard />
      {modal()}
      {confirm.isOpen && <ConfirmationModal config={confirm} />}
    </ParentPage>
  )
}

export default ManageLearn
