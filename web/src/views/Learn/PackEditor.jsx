import {
  AddRounded,
  ChevronLeftRounded,
  ContentPasteRounded,
  DeleteOutlineRounded,
  FileDownloadRounded,
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
  Textarea,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ModalActions from '../../components/common/ModalActions'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import {
  useImportModule,
  useLearnCatalogue,
  useLearnModuleFile,
  useLearnModules,
  useRemoveModule,
} from '../../queries/LearnQueries'
import {
  cardDone,
  cardFrom,
  editable,
  fieldsOf,
  fromDocument,
  kindOf,
  KINDS,
  moduleIdFor,
  newPack,
  nextVersion,
  readList,
  toDocument,
} from '../../utils/learn/familyPack'
import { iconFile, ICONS } from '../../utils/learn/icons'
import LoadingComponent from '../components/Loading'
import { surfaceSx } from '../Games/GameParts'
import { ParentPage } from '../Manage/ParentPages'
import { useExportModule } from './FamilyPacks'
import { LearnIcon } from './LearnParts'
import { useNotify } from './ManageLearn'
import RemoveModal from './RemoveModal'

const NEW = 'nouveau'

const AUDIENCES = ['enfant', 'adulte', 'tous']
const LEVELS = [
  'PS',
  'MS',
  'GS',
  'CP',
  'CE1',
  'CE2',
  'CM1',
  'CM2',
  'Collège',
  'Lycée',
]
const SUBJECTS = [
  'francais',
  'maths',
  'anglais',
  'langues',
  'geographie',
  'histoire',
  'sciences',
]

const KIND_COLORS = {
  saisie: 'primary',
  choix: 'success',
  dictee: 'warning',
  retourner: 'neutral',
  autre: 'neutral',
}

const lines = text =>
  String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

const field = (label, control, id) => (
  <Box>
    <Typography
      level='title-sm'
      component='label'
      htmlFor={id}
      sx={{ mb: 0.5, display: 'block' }}
    >
      {label}
    </Typography>
    {control}
  </Box>
)

// KindChoice picks how a card is answered.
const KindChoice = ({ kinds, onPick, value }) => {
  const { t } = useTranslation('learn')
  return (
    <Box
      role='group'
      aria-label={t('pack.kind')}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 1,
      }}
    >
      {kinds.map(kind => (
        <Button
          key={kind}
          variant={value === kind ? 'soft' : 'outlined'}
          color={value === kind ? 'primary' : 'neutral'}
          aria-pressed={value === kind}
          onClick={() => onPick(kind)}
        >
          {t(`pack.kinds.${kind}`)}
        </Button>
      ))}
    </Box>
  )
}

KindChoice.propTypes = {
  kinds: PropTypes.array.isRequired,
  onPick: PropTypes.func.isRequired,
  value: PropTypes.string.isRequired,
}

// CardModal writes or changes one card.
const CardModal = ({ card, onClose, onDelete, onSave }) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const start = card ? fieldsOf(card) : { oneTypo: true }
  const [kind, setKind] = useState(card ? kindOf(card) : 'saisie')
  const [question, setQuestion] = useState(start.question || '')
  const [answer, setAnswer] = useState(start.answer || '')
  const [traps, setTraps] = useState((start.traps || []).join('\n'))
  const [others, setOthers] = useState((start.others || []).join('\n'))
  const [oneTypo, setOneTypo] = useState(!!start.oneTypo)
  const written = cardFrom(
    kind,
    { question, answer, oneTypo, traps: lines(traps), others: lines(others) },
    card || {},
  )

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={t(card ? 'pack.cardTitle' : 'pack.newCard')}
      footer={
        <ModalActions
          tertiary={
            onDelete && {
              label: t('pack.deleteCard'),
              color: 'danger',
              onClick: onDelete,
            }
          }
          secondary={{ label: t('manage.cancel'), onClick: onClose }}
          primary={{
            label: t('pack.saveCard'),
            onClick: () => onSave(written),
            disabled: !cardDone(written),
          }}
        />
      }
    >
      <Stack gap={2}>
        <Box>
          <Typography level='title-sm' sx={{ mb: 0.5 }}>
            {t('pack.kind')}
          </Typography>
          <KindChoice kinds={KINDS} value={kind} onPick={setKind} />
        </Box>
        {field(
          t(kind === 'dictee' ? 'pack.word' : 'pack.question'),
          <Input
            slotProps={{ input: { id: 'pack-question' } }}
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />,
          'pack-question',
        )}
        {kind !== 'dictee' &&
          field(
            t('pack.answer'),
            <Input
              slotProps={{ input: { id: 'pack-answer' } }}
              value={answer}
              onChange={e => setAnswer(e.target.value)}
            />,
            'pack-answer',
          )}
        {kind === 'choix' &&
          field(
            t('pack.traps'),
            <Textarea
              slotProps={{ textarea: { id: 'pack-traps' } }}
              minRows={2}
              value={traps}
              placeholder={t('pack.trapsHelp')}
              onChange={e => setTraps(e.target.value)}
            />,
            'pack-traps',
          )}
        {kind === 'saisie' &&
          field(
            t('pack.others'),
            <Textarea
              slotProps={{ textarea: { id: 'pack-others' } }}
              minRows={2}
              value={others}
              placeholder={t('pack.othersHelp')}
              onChange={e => setOthers(e.target.value)}
            />,
            'pack-others',
          )}
        {(kind === 'saisie' || kind === 'dictee') && (
          <Checkbox
            label={t('pack.oneTypo')}
            checked={oneTypo}
            onChange={e => setOneTypo(e.target.checked)}
          />
        )}
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {t(`pack.kindHelp.${kind}`)}
        </Typography>
      </Stack>
    </ResponsiveModal>
  )
}

CardModal.propTypes = {
  card: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onDelete: PropTypes.func,
  onSave: PropTypes.func.isRequired,
}

// PasteModal turns a pasted list into cards of a chapter.
const PasteModal = ({ cards, chapterName, onAdd, onClose }) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const [as, setAs] = useState('words')
  const [kind, setKind] = useState('saisie')
  const [text, setText] = useState('')
  const [oneTypo, setOneTypo] = useState(true)
  const read = useMemo(
    () => readList(text, { as, kind, oneTypo }, cards),
    [text, as, kind, oneTypo, cards],
  )

  const option = (value, title, help) => (
    <Button
      variant={as === value ? 'soft' : 'outlined'}
      color={as === value ? 'primary' : 'neutral'}
      aria-pressed={as === value}
      onClick={() => setAs(value)}
      sx={{
        justifyContent: 'flex-start',
        textAlign: 'left',
        py: 1,
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
    >
      <Typography level='title-sm'>{title}</Typography>
      <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
        {help}
      </Typography>
    </Button>
  )

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={t('pack.paste')}
      footer={
        <ModalActions
          secondary={{ label: t('manage.cancel'), onClick: onClose }}
          primary={{
            label: t('pack.pasteAdd', { count: read.cards.length }),
            onClick: () => onAdd(read.cards),
            disabled: !read.cards.length,
          }}
        />
      }
    >
      <Stack gap={2}>
        <Stack gap={1} role='group' aria-label={t('pack.pasteWhat')}>
          {option('words', t('pack.pasteWords'), t('pack.pasteWordsHelp'))}
          {option(
            'questions',
            t('pack.pasteQuestions'),
            t('pack.pasteQuestionsHelp'),
          )}
        </Stack>
        {as === 'questions' && (
          <Box>
            <Typography level='title-sm' sx={{ mb: 0.5 }}>
              {t('pack.kind')}
            </Typography>
            <KindChoice
              kinds={['saisie', 'choix', 'retourner']}
              value={kind}
              onPick={setKind}
            />
          </Box>
        )}
        {field(
          t('pack.pasteList'),
          <Textarea
            slotProps={{ textarea: { id: 'pack-paste' } }}
            minRows={6}
            maxRows={14}
            value={text}
            placeholder={t(
              as === 'words'
                ? 'pack.pasteWordsExample'
                : 'pack.pasteQuestionsExample',
            )}
            onChange={e => setText(e.target.value)}
          />,
          'pack-paste',
        )}
        {(as === 'words' || kind === 'saisie') && (
          <Checkbox
            label={t('pack.oneTypo')}
            checked={oneTypo}
            onChange={e => setOneTypo(e.target.checked)}
          />
        )}
        {text.trim() && (
          <Typography level='body-sm' color='success'>
            {t('pack.pasteCount', {
              count: read.cards.length,
              chapter: chapterName,
            })}
            {read.skipped > 0 &&
              ` ${t('pack.pasteSkipped', { count: read.skipped })}`}
          </Typography>
        )}
      </Stack>
    </ResponsiveModal>
  )
}

PasteModal.propTypes = {
  cards: PropTypes.array.isRequired,
  chapterName: PropTypes.string.isRequired,
  onAdd: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

// CardRow is one card of a chapter; a card the editor does not write is
// only shown, and may be removed.
const CardRow = ({ card, onOpen, onRemove }) => {
  const { t } = useTranslation('learn')
  const kind = kindOf(card)
  const label =
    kind === 'dictee'
      ? t('pack.dictationLine')
      : kind === 'choix' && card.pieges?.length
        ? `${card.reponse} · ${card.pieges.join(', ')}`
        : card.reponse
  const chip = (
    <Chip size='sm' variant='soft' color={KIND_COLORS[kind]}>
      {t(`pack.kinds.${kind}`)}
    </Chip>
  )
  const body = (
    <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
      <Typography level='title-sm' noWrap>
        {card.question}
      </Typography>
      {label && (
        <Typography level='body-xs' sx={{ color: 'text.secondary' }} noWrap>
          {label}
        </Typography>
      )}
    </Box>
  )
  if (kind === 'autre') {
    return (
      <Sheet
        variant='outlined'
        sx={{
          borderRadius: 'md',
          px: 1.25,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {body}
        {chip}
        <IconButton
          size='sm'
          variant='plain'
          color='danger'
          aria-label={t('pack.deleteCard')}
          onClick={onRemove}
        >
          <DeleteOutlineRounded />
        </IconButton>
      </Sheet>
    )
  }
  return (
    <Button
      variant='outlined'
      color='neutral'
      onClick={onOpen}
      sx={{
        justifyContent: 'flex-start',
        gap: 1,
        px: 1.25,
        py: 0.75,
        fontWeight: 'inherit',
      }}
    >
      {body}
      {chip}
    </Button>
  )
}

CardRow.propTypes = {
  card: PropTypes.object.isRequired,
  onOpen: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
}

// /manage/learn/editeur/:moduleId: a pack of the family, written without a
// file; "nouveau" starts one.
const BackLink = () => {
  const { t } = useTranslation('learn')
  return (
    <Button
      variant='plain'
      color='neutral'
      startDecorator={<ChevronLeftRounded />}
      component={Link}
      to='/manage/learn/catalogue'
      sx={{ alignSelf: 'flex-start' }}
    >
      {t('pack.back')}
    </Button>
  )
}

// readFile reads the document of a pack for the editor: the pack, or null
// when the editor cannot write it.
const readFile = text => {
  try {
    const doc = JSON.parse(text)
    return editable(doc) ? fromDocument(doc) : null
  } catch {
    return null
  }
}

const PackEditor = () => {
  const { t } = useTranslation('learn')
  const { moduleId } = useParams()
  const isNew = moduleId === NEW
  const file = useLearnModuleFile(isNew ? '' : moduleId)
  const start = useMemo(
    () => (isNew ? newPack() : file.data ? readFile(file.data) : undefined),
    [isNew, file.data],
  )

  if (file.isError || start === null) {
    return (
      <ParentPage page='learn'>
        <BackLink />
        <Sheet sx={surfaceSx}>
          <Typography level='body-md'>
            {file.isError ? file.error.message : t('pack.notEditable')}
          </Typography>
        </Sheet>
      </ParentPage>
    )
  }
  if (!start) return <LoadingComponent />
  return (
    <PackForm key={moduleId} start={start} isNew={isNew} moduleId={moduleId} />
  )
}

// PackForm is the editor of a pack, from what it holds when opened.
const PackForm = ({ isNew, moduleId, start }) => {
  const { t } = useTranslation('learn')
  const navigate = useNavigate()
  const notify = useNotify()
  const { data: installed } = useLearnModules()
  const { data: catalogue = [] } = useLearnCatalogue()
  const save = useImportModule()
  const remove = useRemoveModule()
  const [exportModule, exporting] = useExportModule()
  const [pack, setPack] = useState(start)
  const [open, setOpen] = useState(null)
  const [pasting, setPasting] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const back = <BackLink />

  const change = fields => setPack(p => ({ ...p, ...fields }))
  const changeChapter = (index, fields) =>
    setPack(p => ({
      ...p,
      chapters: p.chapters.map((c, i) =>
        i === index ? { ...c, ...fields } : c,
      ),
    }))
  const setCards = (index, cards) => changeChapter(index, { cards })
  const count = pack.chapters.reduce((n, c) => n + c.cards.length, 0)
  const chapterName = (chapter, index) =>
    chapter.nom.trim() || t('pack.chapterN', { n: index + 1 })

  const send = async () => {
    setError('')
    const taken = [
      ...(installed?.modules || []).map(m => m.id),
      ...catalogue.map(entry => entry.id),
    ]
    const doc = toDocument({
      ...pack,
      id: pack.id || moduleIdFor(pack.name, taken),
      version: isNew ? '1.0.0' : nextVersion(pack.version),
    })
    try {
      await save.mutateAsync(JSON.stringify(doc))
      notify(
        'success',
        t(isNew ? 'pack.created' : 'pack.saved', { name: doc.nom }),
      )
      navigate('/manage/learn/catalogue')
    } catch (err) {
      setError(err.message)
    }
  }

  const removed = async (ok, forget) => {
    setRemoving(false)
    if (!ok) return
    try {
      await remove.mutateAsync({ id: moduleId, forget })
      navigate('/manage/learn/catalogue')
    } catch (err) {
      notify('error', err.message)
    }
  }

  const editing = open && pack.chapters[open.chapter]

  return (
    <ParentPage page='learn'>
      {back}
      <Input
        aria-label={t('pack.name')}
        placeholder={t('pack.namePlaceholder')}
        value={pack.name}
        onChange={e => change({ name: e.target.value })}
        sx={{
          fontSize: 'xl',
          fontWeight: 600,
          minHeight: 56,
          borderRadius: 'lg',
        }}
      />

      <Sheet sx={surfaceSx}>
        <Stack direction='row' alignItems='center' gap={1.5} sx={{ mb: 1 }}>
          <LearnIcon
            entity={{ icon: pack.icon, subject: pack.subject }}
            size={44}
          />
          <Typography level='title-md'>{t('pack.icon')}</Typography>
        </Stack>
        <Box
          role='group'
          aria-label={t('pack.icon')}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            maxHeight: 188,
            overflowY: 'auto',
          }}
        >
          <Button
            size='sm'
            variant={pack.icon ? 'outlined' : 'soft'}
            color={pack.icon ? 'neutral' : 'primary'}
            aria-pressed={!pack.icon}
            onClick={() => change({ icon: '' })}
          >
            {t('pack.iconAuto')}
          </Button>
          {ICONS.map(emoji => (
            <Button
              key={emoji}
              variant={pack.icon === emoji ? 'soft' : 'plain'}
              color={pack.icon === emoji ? 'primary' : 'neutral'}
              aria-pressed={pack.icon === emoji}
              aria-label={emoji}
              onClick={() => change({ icon: emoji })}
              sx={{ minHeight: 40, minWidth: 40, p: 0.5 }}
            >
              <Box
                component='img'
                src={iconFile(emoji)}
                alt=''
                sx={{ height: 28, width: 28 }}
              />
            </Button>
          ))}
        </Box>
      </Sheet>

      <Sheet sx={surfaceSx}>
        <Typography level='title-md' sx={{ mb: 1 }}>
          {t('pack.forWho')}
        </Typography>
        <Stack
          direction='row'
          gap={1}
          role='group'
          aria-label={t('pack.forWho')}
        >
          {AUDIENCES.map(audience => (
            <Button
              key={audience}
              sx={{ flex: 1 }}
              variant={pack.audience === audience ? 'soft' : 'outlined'}
              color={pack.audience === audience ? 'primary' : 'neutral'}
              aria-pressed={pack.audience === audience}
              onClick={() => change({ audience })}
            >
              {t(`pack.audiences.${audience}`)}
            </Button>
          ))}
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1.5,
            mt: 1.5,
          }}
        >
          {field(
            t('pack.level'),
            <Select
              slotProps={{ button: { id: 'pack-level' } }}
              value={pack.level}
              onChange={(_, level) => change({ level: level ?? '' })}
            >
              <Option value=''>{t('pack.none')}</Option>
              {[...new Set([...LEVELS, pack.level].filter(Boolean))].map(
                level => (
                  <Option key={level} value={level}>
                    {level}
                  </Option>
                ),
              )}
            </Select>,
            'pack-level',
          )}
          {field(
            t('pack.subject'),
            <Select
              slotProps={{ button: { id: 'pack-subject' } }}
              value={pack.subject}
              onChange={(_, subject) => change({ subject: subject ?? '' })}
            >
              <Option value=''>{t('pack.none')}</Option>
              {[...new Set([...SUBJECTS, pack.subject].filter(Boolean))].map(
                subject => (
                  <Option key={subject} value={subject}>
                    {SUBJECTS.includes(subject)
                      ? t(`pack.subjects.${subject}`)
                      : subject}
                  </Option>
                ),
              )}
            </Select>,
            'pack-subject',
          )}
        </Box>
      </Sheet>

      {pack.chapters.map((chapter, index) => (
        <Sheet key={chapter.id || `new-${index}`} sx={surfaceSx}>
          <Stack direction='row' gap={1} alignItems='center' sx={{ mb: 1 }}>
            <Input
              aria-label={t('pack.chapterName')}
              placeholder={
                pack.chapters.length === 1 && pack.name.trim()
                  ? pack.name
                  : t('pack.chapterN', { n: index + 1 })
              }
              value={chapter.nom}
              onChange={e => changeChapter(index, { nom: e.target.value })}
              sx={{ flex: 1, fontWeight: 600 }}
            />
            <Typography
              level='body-sm'
              sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
            >
              {t('pack.cards', { count: chapter.cards.length })}
            </Typography>
            {pack.chapters.length > 1 && (
              <IconButton
                variant='plain'
                color='danger'
                aria-label={t('pack.deleteChapter', {
                  name: chapterName(chapter, index),
                })}
                onClick={() =>
                  setPack(p => ({
                    ...p,
                    chapters: p.chapters.filter((_, i) => i !== index),
                  }))
                }
              >
                <DeleteOutlineRounded />
              </IconButton>
            )}
          </Stack>
          <Stack gap={0.75}>
            {chapter.cards.map((card, cardIndex) => (
              <CardRow
                key={card.id || `card-${cardIndex}`}
                card={card}
                onOpen={() => setOpen({ chapter: index, card: cardIndex })}
                onRemove={() =>
                  setCards(
                    index,
                    chapter.cards.filter((_, i) => i !== cardIndex),
                  )
                }
              />
            ))}
          </Stack>
          <Stack direction='row' gap={1} sx={{ mt: 1.25 }}>
            <Button
              sx={{ flex: 1 }}
              variant='outlined'
              color='neutral'
              startDecorator={<AddRounded />}
              onClick={() => setOpen({ chapter: index, card: -1 })}
            >
              {t('pack.addCard')}
            </Button>
            <Button
              sx={{ flex: 1 }}
              variant='soft'
              color='primary'
              startDecorator={<ContentPasteRounded />}
              onClick={() => setPasting(index)}
            >
              {t('pack.paste')}
            </Button>
          </Stack>
        </Sheet>
      ))}

      <Button
        variant='outlined'
        color='neutral'
        startDecorator={<AddRounded />}
        onClick={() =>
          setPack(p => ({
            ...p,
            chapters: [...p.chapters, { id: '', nom: '', cards: [] }],
          }))
        }
        sx={{ borderStyle: 'dashed' }}
      >
        {t('pack.addChapter')}
      </Button>

      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('pack.settingsHint')}
      </Typography>

      {error && (
        <Typography level='body-sm' color='danger'>
          {error}
        </Typography>
      )}
      <Stack direction='row' gap={1} flexWrap='wrap'>
        {!isNew && (
          <Button
            variant='outlined'
            color='danger'
            startDecorator={<DeleteOutlineRounded />}
            onClick={() => setRemoving(true)}
          >
            {t('manage.remove')}
          </Button>
        )}
        {!isNew && (
          <Button
            variant='outlined'
            color='neutral'
            startDecorator={<FileDownloadRounded />}
            loading={exporting === moduleId}
            onClick={() => exportModule(moduleId)}
          >
            {t('pack.export')}
          </Button>
        )}
        <Button
          sx={{ flex: 1, minWidth: 160 }}
          onClick={send}
          loading={save.isPending}
          disabled={!pack.name.trim() || count === 0}
        >
          {t('pack.save')}
        </Button>
      </Stack>
      {(!pack.name.trim() || count === 0) && (
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {t('pack.saveNeeds')}
        </Typography>
      )}

      {editing && (
        <CardModal
          card={open.card >= 0 ? editing.cards[open.card] : null}
          onClose={() => setOpen(null)}
          onDelete={
            open.card >= 0
              ? () => {
                  setCards(
                    open.chapter,
                    editing.cards.filter((_, i) => i !== open.card),
                  )
                  setOpen(null)
                }
              : undefined
          }
          onSave={card => {
            setCards(
              open.chapter,
              open.card >= 0
                ? editing.cards.map((c, i) => (i === open.card ? card : c))
                : [...editing.cards, card],
            )
            setOpen(null)
          }}
        />
      )}
      {pasting !== null && pack.chapters[pasting] && (
        <PasteModal
          cards={pack.chapters[pasting].cards}
          chapterName={chapterName(pack.chapters[pasting], pasting)}
          onClose={() => setPasting(null)}
          onAdd={cards => {
            setCards(pasting, [...pack.chapters[pasting].cards, ...cards])
            setPasting(null)
          }}
        />
      )}
      {removing && <RemoveModal name={pack.name} onClose={removed} />}
    </ParentPage>
  )
}

PackForm.propTypes = {
  isNew: PropTypes.bool.isRequired,
  moduleId: PropTypes.string.isRequired,
  start: PropTypes.object.isRequired,
}

export default PackEditor
