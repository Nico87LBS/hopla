import {
  DeleteOutlineRounded,
  DownloadDoneRounded,
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
} from '../../queries/LearnQueries'
import { useNotification } from '../../service/NotificationProvider'
import LoadingComponent from '../components/Loading'
import { MemberAvatar, surfaceSx } from '../Games/GameParts'
import { ParentPage, useMembers } from '../Manage/ParentPages'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'

const HEAD = 40

const useNotify = () => {
  const { showNotification } = useNotification()
  return (type, message) => showNotification({ type, message })
}

// The settings of one module, person by person: the day's cap in hops and
// how well a chapter must be known to open the next. Left empty, the
// module's own apply.
const SettingsModal = ({ activations, members, module, onClose }) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const setActivation = useSetActivation()
  const notify = useNotify()
  const players = members.filter(m =>
    activations.has(`${m.userId}:${module.id}`),
  )
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      players.map(m => {
        const a = activations.get(`${m.userId}:${module.id}`)
        return [
          m.userId,
          { cap: a.dailyCap ?? '', unlock: a.unlockPercent ?? '' },
        ]
      }),
    ),
  )
  const set = (userId, name, value) =>
    setValues(v => ({
      ...v,
      [userId]: { ...v[userId], [name]: value.replace(/\D/g, '') },
    }))

  const save = async () => {
    try {
      for (const member of players) {
        const { cap, unlock } = values[member.userId]
        await setActivation.mutateAsync({
          userId: member.userId,
          modules: [module.id],
          active: true,
          dailyCap: cap === '' ? -1 : Number(cap),
          unlockPercent: unlock === '' ? -1 : Number(unlock),
        })
      }
      notify('success', t('manage.saved'))
      onClose()
    } catch (err) {
      notify('error', err.message)
    }
  }

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={module.name}
      footer={
        <ModalActions
          secondary={{ label: t('manage.cancel'), onClick: onClose }}
          primary={{
            label: t('manage.save'),
            onClick: save,
            loading: setActivation.isPending,
            disabled: players.length === 0,
          }}
        />
      }
    >
      {players.length === 0 ? (
        <Typography level='body-sm'>{t('manage.settingsNobody')}</Typography>
      ) : (
        <Stack gap={1.5}>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('manage.settingsHelp')}
          </Typography>
          {players.map(member => (
            <Stack
              key={member.userId}
              direction='row'
              gap={1.5}
              alignItems='flex-end'
            >
              <Stack alignItems='center' sx={{ width: 64 }}>
                <MemberAvatar member={member} size={HEAD} />
                <Typography level='body-xs' noWrap sx={{ maxWidth: 64 }}>
                  {member.displayName}
                </Typography>
              </Stack>
              <Box sx={{ flex: 1 }}>
                <Typography level='body-xs'>{t('manage.cap')}</Typography>
                <Input
                  value={values[member.userId].cap}
                  onChange={e => set(member.userId, 'cap', e.target.value)}
                  placeholder={t('manage.moduleOwn')}
                  endDecorator={t('manage.hopsUnit')}
                  slotProps={{ input: { inputMode: 'numeric' } }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography level='body-xs'>{t('manage.unlock')}</Typography>
                <Input
                  value={values[member.userId].unlock}
                  onChange={e => set(member.userId, 'unlock', e.target.value)}
                  placeholder={t('manage.moduleOwn')}
                  endDecorator='%'
                  slotProps={{ input: { inputMode: 'numeric' } }}
                />
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
    </ResponsiveModal>
  )
}

SettingsModal.propTypes = {
  activations: PropTypes.instanceOf(Map).isRequired,
  members: PropTypes.array.isRequired,
  module: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
}

// One installed pack, or the modules outside any pack: who plays which
// sub-module, with a head per person.
const ModuleGroup = ({ activations, group, members, onRemove, onSettings }) => {
  const { t } = useTranslation('learn')
  const setActivation = useSetActivation()
  const notify = useNotify()
  const isOn = (userId, id) => activations.has(`${userId}:${id}`)
  const columns = `minmax(0, 1fr) repeat(${members.length}, ${HEAD + 8}px) 36px`

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
          <IconButton
            variant='plain'
            color='danger'
            aria-label={t('manage.remove')}
            onClick={() => onRemove(group.pack)}
          >
            <DeleteOutlineRounded />
          </IconButton>
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
            <IconButton
              size='sm'
              variant='plain'
              aria-label={t('manage.settings')}
              onClick={() => onSettings(module)}
            >
              <TuneRounded />
            </IconButton>
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
  onRemove: PropTypes.func.isRequired,
  onSettings: PropTypes.func.isRequired,
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
  const notify = useNotify()
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
      {groups.map(group => (
        <ModuleGroup
          key={group.pack?.id || 'others'}
          group={group}
          members={members}
          activations={activations}
          onRemove={askRemove}
          onSettings={setSettingsFor}
        />
      ))}
      <CatalogueCard installed={new Set(modules.map(m => m.id))} />
      <ImportCard />
      {settingsFor && (
        <SettingsModal
          module={settingsFor}
          members={members}
          activations={activations}
          onClose={() => setSettingsFor(null)}
        />
      )}
      {confirm.isOpen && <ConfirmationModal config={confirm} />}
    </ParentPage>
  )
}

export default ManageLearn
