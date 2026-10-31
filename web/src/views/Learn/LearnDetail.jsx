import {
  ChevronRightRounded,
  DeleteOutlineRounded,
  DownloadDoneRounded,
  EditRounded,
  ExpandMoreRounded,
  OutlinedFlagRounded,
  SwapHorizRounded,
  TuneRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { createContext, useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import {
  useInstallModule,
  useLearnDetail,
  useLearnModules,
  useRemoveModule,
} from '../../queries/LearnQueries'
import { compile, seededRandom } from '../../utils/learn/engine'
import LoadingComponent from '../components/Loading'
import { surfaceSx } from '../Games/GameParts'
import { ParentPage } from '../Manage/ParentPages'
import CardEditor, { ReportList } from './CardEditor'
import { FAMILY, FamilySettings, OwnChips, useNotify } from './ManageLearn'
import RemoveModal from './RemoveModal'

// Toggle is a row that opens what is under it.
const Toggle = ({ children, onClick, open }) => (
  <Stack
    direction='row'
    alignItems='center'
    gap={1}
    role='button'
    tabIndex={0}
    aria-expanded={open}
    onClick={onClick}
    onKeyDown={e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    }}
    sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
  >
    {open ? (
      <ExpandMoreRounded sx={{ color: HOPLA.violet }} />
    ) : (
      <ChevronRightRounded sx={{ color: 'text.tertiary' }} />
    )}
    {children}
  </Stack>
)

Toggle.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
}

// Fixes are the family's corrections and the reports of the page, and how
// to open a card to correct it.
const Fixes = createContext({ edits: new Map(), reports: new Map() })

const ReportCount = ({ count }) => {
  const { t } = useTranslation('learn')
  if (!count) return null
  return (
    <Chip
      size='sm'
      variant='soft'
      color='warning'
      startDecorator={<OutlinedFlagRounded />}
    >
      {t('detail.reports', { count })}
    </Chip>
  )
}

ReportCount.propTypes = { count: PropTypes.number }

// A written card: its question, its answer, and the example shown after.
const CardRow = ({ card, moduleId }) => {
  const { t } = useTranslation('learn')
  const { edits, onEdit, reports } = useContext(Fixes)
  const both = card.sens?.includes('inverse')
  const id = `${moduleId}:${card.id}`
  const edited = edits.has(id)
  const reported = reports.get(id) || []
  return (
    <Stack
      direction='row'
      gap={1}
      alignItems='flex-start'
      sx={{ borderTop: '1px solid', borderColor: 'divider', py: 1 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level='body-sm'>{card.question}</Typography>
        <Stack direction='row' gap={0.75} alignItems='center'>
          <Typography level='title-sm' sx={{ color: HOPLA.violet }}>
            {card.reponse}
          </Typography>
          {both && (
            <SwapHorizRounded
              titleAccess={t('detail.bothWays')}
              sx={{ color: 'text.tertiary', fontSize: 18 }}
            />
          )}
        </Stack>
        {card.explication && (
          <Typography
            level='body-xs'
            sx={{ color: 'text.tertiary', fontStyle: 'italic' }}
          >
            {card.explication}
          </Typography>
        )}
        {(edited || reported.length > 0) && (
          <Stack direction='row' gap={0.5} sx={{ mt: 0.5 }} flexWrap='wrap'>
            {edited && (
              <Chip size='sm' variant='soft' color='primary'>
                {t('detail.edited')}
              </Chip>
            )}
            <ReportCount count={reported.length} />
          </Stack>
        )}
      </Box>
      {onEdit && (
        <IconButton
          size='sm'
          variant='plain'
          aria-label={t('edit.title', { name: card.reponse })}
          onClick={() => onEdit(moduleId, card)}
        >
          <EditRounded />
        </IconButton>
      )}
    </Stack>
  )
}

CardRow.propTypes = {
  card: PropTypes.object.isRequired,
  moduleId: PropTypes.string.isRequired,
}

// The written cards of a chapter are one source; the others are generators.
const isGenerator = source => !source.id.startsWith('fiches:')

// A chapter of a module: its cards, or an example of what its exercises
// drawn at random look like.
const ChapterRow = ({ chapter, doc }) => {
  const { t } = useTranslation('learn')
  const { reports } = useContext(Fixes)
  const [open, setOpen] = useState(false)
  const cards = (doc.fiches || []).filter(c => c.chapitre === chapter.id)
  const sources = [
    ...cards.map(c => c.id),
    ...(doc.generateurs || [])
      .filter(g => g.chapitre === chapter.id)
      .map(g => g.id),
  ]
  const reported = sources.flatMap(id => reports.get(`${doc.id}:${id}`) || [])
  // Questions drawn at random are corrected in the module itself: their
  // reports show here.
  const drawn = (doc.generateurs || [])
    .filter(g => g.chapitre === chapter.id)
    .flatMap(g => reports.get(`${doc.id}:${g.id}`) || [])
  const examples = useMemo(() => {
    if (!open) return []
    const rng = seededRandom(1)
    return chapter.sources
      .filter(isGenerator)
      .map(source => source.draw(rng))
      .filter(Boolean)
  }, [open, chapter])
  const generated = chapter.sources.filter(isGenerator).length

  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}>
      <Toggle open={open} onClick={() => setOpen(!open)}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-sm'>{chapter.name}</Typography>
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
            {[
              cards.length > 0 && t('detail.cards', { count: cards.length }),
              generated > 0 && t('detail.generated', { count: generated }),
              chapter.openAfter > 0 &&
                t('detail.opensAt', { value: chapter.openAfter }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </Box>
        <ReportCount count={reported.length} />
      </Toggle>
      {open && (
        <Box sx={{ pl: 4, pb: 1 }}>
          {drawn.length > 0 && (
            <Box sx={{ py: 1 }}>
              {drawn.map(report => (
                <Typography key={report.id} level='body-sm'>
                  « {report.prompt} » → {report.expected}
                </Typography>
              ))}
              <Box sx={{ mt: 1 }}>
                <ReportList reports={drawn} />
              </Box>
            </Box>
          )}
          {examples.length > 0 && (
            <Box sx={{ py: 1 }}>
              <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                {t('detail.examples')}
              </Typography>
              {examples.map(item => (
                <Typography key={item.key} level='body-sm' sx={{ mt: 0.5 }}>
                  {item.prompt}{' '}
                  <Typography sx={{ color: HOPLA.violet, fontWeight: 600 }}>
                    → {item.answer}
                    {item.unit ? ` ${item.unit}` : ''}
                  </Typography>
                </Typography>
              ))}
            </Box>
          )}
          {cards.map(card => (
            <CardRow key={card.id} card={card} moduleId={doc.id} />
          ))}
        </Box>
      )}
    </Box>
  )
}

ChapterRow.propTypes = {
  chapter: PropTypes.object.isRequired,
  doc: PropTypes.object.isRequired,
}

// A module of the pack: its chapters, and the family's settings for it.
const ModuleRow = ({ compiled, installed, onSettings, settings, single }) => {
  const { t } = useTranslation('learn')
  const { reports } = useContext(Fixes)
  const [open, setOpen] = useState(single)
  const { doc } = compiled
  const count = (doc.fiches || []).length
  return (
    <Stack
      gap={1}
      sx={
        single
          ? {}
          : { borderTop: '1px solid', borderColor: 'divider', pt: 1.25 }
      }
    >
      <Stack direction='row' alignItems='center' gap={1}>
        <Toggle open={open} onClick={() => setOpen(!open)}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level='title-md'>{doc.nom}</Typography>
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
              {[
                t('detail.chapters', { count: compiled.chapters.length }),
                count > 0 && t('detail.cards', { count }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
          <ReportCount
            count={[...reports.entries()]
              .filter(([id]) => id.startsWith(`${doc.id}:`))
              .reduce((n, [, list]) => n + list.length, 0)}
          />
        </Toggle>
        {installed && !single && (
          <IconButton
            variant='plain'
            aria-label={t('manage.familySettings', { name: doc.nom })}
            onClick={() => onSettings({ id: doc.id, name: doc.nom })}
          >
            <TuneRounded />
          </IconButton>
        )}
      </Stack>
      {installed && !single && (
        <Box sx={{ pl: 4 }}>
          <OwnChips from='family' row={settings.get(`${FAMILY}:${doc.id}`)} />
        </Box>
      )}
      {open && (
        <Box sx={{ pl: single ? 0 : 2 }}>
          {compiled.chapters.map(chapter => (
            <ChapterRow key={chapter.id} chapter={chapter} doc={doc} />
          ))}
        </Box>
      )}
    </Stack>
  )
}

ModuleRow.propTypes = {
  compiled: PropTypes.object.isRequired,
  installed: PropTypes.bool.isRequired,
  onSettings: PropTypes.func.isRequired,
  settings: PropTypes.instanceOf(Map).isRequired,
  single: PropTypes.bool,
}

// /manage/learn/detail/:moduleId: what a pack or a module holds, down to its
// cards, and the family's settings for it once installed.
export const LearnDetail = () => {
  const { t } = useTranslation('learn')
  const { moduleId } = useParams()
  const navigate = useNavigate()
  const notify = useNotify()
  const { data, error, isLoading } = useLearnDetail(moduleId)
  const { data: installedData } = useLearnModules()
  const install = useInstallModule()
  const remove = useRemoveModule()
  const [settingsFor, setSettingsFor] = useState(null)
  const [confirm, setConfirm] = useState({})
  // The card being corrected: { moduleId, card }.
  const [editing, setEditing] = useState(null)

  const settings = useMemo(
    () =>
      new Map(
        (installedData?.settings || []).map(s => [`${s.userId}:${s.scope}`, s]),
      ),
    [installedData?.settings],
  )
  const view = useMemo(() => {
    if (!data?.documents?.length) return null
    const [main, ...children] = data.documents
    const modules = (children.length ? children : [main]).map(compile)
    return {
      main,
      modules,
      cards: modules.reduce((n, m) => n + (m.doc.fiches || []).length, 0),
    }
  }, [data])

  const fixes = useMemo(() => {
    const byCard = (list, key) => {
      const out = new Map()
      for (const row of list || []) {
        const id = `${row.module}:${row[key]}`
        out.set(id, [...(out.get(id) || []), row])
      }
      return out
    }
    return {
      edits: new Map(
        (data?.edits || []).map(e => [`${e.module}:${e.card}`, e.original]),
      ),
      reports: byCard(data?.reports, 'card'),
      onEdit: data?.installed
        ? (moduleId, card) => setEditing({ moduleId, card })
        : null,
    }
  }, [data])

  const add = async () => {
    try {
      await install.mutateAsync(moduleId)
      notify('success', t('manage.installed', { name: view.main.nom }))
    } catch (err) {
      notify('error', err.message)
    }
  }

  const askRemove = () =>
    setConfirm({
      isOpen: true,
      name: view.main.nom,
      onClose: async (ok, forget) => {
        setConfirm({})
        if (!ok) return
        try {
          await remove.mutateAsync({ id: moduleId, forget })
          navigate('/manage/learn', { replace: true })
        } catch (err) {
          notify('error', err.message)
        }
      },
    })

  const isPack = view?.main.modules?.length > 0
  const installed = !!data?.installed
  return (
    <ParentPage page='learn'>
      <Fixes.Provider value={fixes}>
        {isLoading && <LoadingComponent />}
        {error && <Typography color='danger'>{error.message}</Typography>}
        {view && (
          <>
            <Box>
              <Typography level='h3'>{view.main.nom}</Typography>
              <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
                {[
                  view.main.auteur &&
                    t('manage.by', { author: view.main.auteur }),
                  view.main.version &&
                    t('detail.version', { version: view.main.version }),
                  isPack &&
                    t('manage.modulesCount', { count: view.modules.length }),
                  view.cards > 0 && t('detail.cards', { count: view.cards }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
              <Stack
                direction='row'
                gap={0.5}
                flexWrap='wrap'
                sx={{ mt: 0.75 }}
              >
                {installed && (
                  <Chip
                    size='sm'
                    color='success'
                    variant='soft'
                    startDecorator={<DownloadDoneRounded />}
                  >
                    {t('manage.isInstalled')}
                  </Chip>
                )}
                {(view.main.niveaux || []).map(level => (
                  <Chip key={level} size='sm' variant='soft'>
                    {level}
                  </Chip>
                ))}
              </Stack>
              {view.main.description && (
                <Typography level='body-sm' sx={{ mt: 1 }}>
                  {view.main.description}
                </Typography>
              )}
            </Box>

            {installed ? (
              <Sheet sx={surfaceSx}>
                <Stack direction='row' alignItems='center' gap={1}>
                  <Box sx={{ flex: 1 }}>
                    <Typography level='title-md'>
                      {t('detail.familySettings')}
                    </Typography>
                    <Typography
                      level='body-xs'
                      sx={{ color: 'text.secondary' }}
                    >
                      {t('detail.familySettingsHelp')}
                    </Typography>
                  </Box>
                  <IconButton
                    variant='soft'
                    color='primary'
                    aria-label={t('manage.familySettings', {
                      name: view.main.nom,
                    })}
                    onClick={() =>
                      setSettingsFor({
                        id: view.main.id,
                        name: view.main.nom,
                        children: view.main.modules,
                      })
                    }
                  >
                    <TuneRounded />
                  </IconButton>
                </Stack>
                <Box sx={{ mt: 1 }}>
                  <OwnChips
                    from='family'
                    row={settings.get(`${FAMILY}:${view.main.id}`)}
                  />
                </Box>
              </Sheet>
            ) : (
              <Button onClick={add} loading={install.isPending}>
                {t('manage.install')}
              </Button>
            )}

            <Sheet sx={surfaceSx}>
              <Stack gap={1.25}>
                {view.modules.map(compiled => (
                  <ModuleRow
                    key={compiled.id}
                    compiled={compiled}
                    installed={installed}
                    settings={settings}
                    single={!isPack}
                    onSettings={setSettingsFor}
                  />
                ))}
              </Stack>
            </Sheet>

            {installed && (
              <Button
                variant='plain'
                color='danger'
                startDecorator={<DeleteOutlineRounded />}
                onClick={askRemove}
                sx={{ alignSelf: 'flex-start' }}
              >
                {t('manage.remove')}
              </Button>
            )}
          </>
        )}
        {settingsFor && (
          <FamilySettings
            entry={settingsFor}
            defaults={installedData?.defaults || {}}
            settings={settings}
            onClose={() => setSettingsFor(null)}
          />
        )}
        {editing && (
          <CardEditor
            card={editing.card}
            moduleId={editing.moduleId}
            original={fixes.edits.get(`${editing.moduleId}:${editing.card.id}`)}
            reports={fixes.reports.get(
              `${editing.moduleId}:${editing.card.id}`,
            )}
            onClose={() => setEditing(null)}
          />
        )}
        {confirm.isOpen && (
          <RemoveModal name={confirm.name} onClose={confirm.onClose} />
        )}
      </Fixes.Provider>
    </ParentPage>
  )
}

export default LearnDetail
