import { OutlinedFlagRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  Input,
  Sheet,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy'
import moment from 'moment'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ModalActions from '../../components/common/ModalActions'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import { useEditCard, useResolveReport } from '../../queries/LearnQueries'
import {
  extrasOf,
  hasOptions,
  listensFor,
  optionsFor,
  toleranceOf,
  typed,
} from '../../utils/learn/cardOptions'
import { labelProblem, labelsFor, labelsOf } from '../../utils/learn/labelCards'
import { useMembers } from '../Manage/ParentPages'
import { CardOptionFields, MoreOptions, ToleranceSelect } from './CardOptions'
import LabelRows from './LabelRows'
import { useNotify } from './ManageLearn'

const lines = text =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

// The types whose answer is a set of labels, not one answer.
const LABELLED = ['associer', 'ordre', 'classer']

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// ReportList shows the reports on a question, each to mark as looked at.
export const ReportList = ({ reports }) => {
  const { t } = useTranslation('learn')
  const members = useMembers()
  const resolve = useResolveReport()
  const notify = useNotify()
  if (!reports?.length) return null
  const nameOf = id => members.find(m => m.userId === id)?.displayName || ''
  return (
    <Stack gap={1}>
      {reports.map(report => (
        <Sheet
          key={report.id}
          variant='soft'
          color='warning'
          sx={{ borderRadius: 'lg', p: 1.25 }}
        >
          <Stack direction='row' gap={0.75} alignItems='center'>
            <OutlinedFlagRounded sx={{ fontSize: 18 }} />
            <Typography level='title-sm' sx={{ color: 'inherit' }}>
              {t(`report.reasons.${report.reason}`)}
            </Typography>
          </Stack>
          <Typography level='body-sm'>
            {t('report.by', {
              name: nameOf(report.userId),
              date: moment(report.reportedAt).format('D MMM'),
            })}
            {report.comment && ` « ${report.comment} »`}
            {report.given && ` ${t('report.given', { given: report.given })}`}
          </Typography>
          <Button
            size='sm'
            variant='outlined'
            color='warning'
            loading={resolve.isPending}
            onClick={() =>
              resolve
                .mutateAsync(report.id)
                .catch(err => notify('error', err.message))
            }
            sx={{ mt: 1 }}
          >
            {t('report.resolve')}
          </Button>
        </Sheet>
      ))}
    </Stack>
  )
}

ReportList.propTypes = { reports: PropTypes.array }

// CardEditor corrects a written card for the family. The correction lies
// over the module and stays when it is updated; the card keeps its key, so
// what everyone learned of it stays too.
const CardEditor = ({ card, moduleId, onClose, original, reports }) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const edit = useEditCard()
  const notify = useNotify()
  const base = original || card
  const [question, setQuestion] = useState(card.question || '')
  const [answer, setAnswer] = useState(card.reponse || '')
  const [traps, setTraps] = useState((card.pieges || []).join('\n'))
  const [others, setOthers] = useState((card.autres_reponses || []).join('\n'))
  const [extras, setExtras] = useState(() => extrasOf(card))
  const [tolerance, setTolerance] = useState(toleranceOf(card))
  const [labels, setLabels] = useState(() => labelsOf(card))
  // A dictation accepts other spellings heard the same way (cet, cette).
  const dictation =
    card.type === 'ecoute' && (extras.sens || []).includes('dictee')
  const variants = typed(card.type, extras.sens)
  const withTraps =
    card.type === 'choix' || (card.type === 'ecoute' && listensFor(extras.sens))
  const labelled = LABELLED.includes(card.type)
  const problem = labelled
    ? labelProblem({
        ...card,
        question,
        ...labelsFor(card.type, labels),
      })
    : ''

  const send = async change => {
    try {
      await edit.mutateAsync({ module: moduleId, card: card.id, ...change })
      notify('success', t('manage.saved'))
      onClose()
    } catch (err) {
      notify('error', err.message)
    }
  }

  const save = () => {
    const wanted = {
      question: question.trim(),
      ...(!labelled && { reponse: answer.trim() }),
      ...labelsFor(card.type, labels),
      ...(withTraps && {
        pieges: lines(traps).length ? lines(traps) : undefined,
      }),
      ...(variants && {
        autres_reponses: lines(others).length ? lines(others) : undefined,
        tolerance:
          tolerance === toleranceOf({ type: card.type }) && !base.tolerance
            ? undefined
            : tolerance,
      }),
      ...optionsFor(card.type, extras, lines(traps)),
    }
    // Each field is sent as the module has it (null, no correction) or as
    // changed, so the correction holds only what differs.
    const fields = {}
    for (const [name, value] of Object.entries(wanted)) {
      fields[name] = same(value, base[name]) ? null : (value ?? null)
    }
    send({ fields })
  }

  const field = (label, control) => (
    <Box>
      <Typography level='title-sm' sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      {control}
    </Box>
  )

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={t('edit.title', { name: base.reponse || base.question })}
      footer={
        <ModalActions
          secondary={
            original
              ? {
                  label: t('edit.revert'),
                  onClick: () => send({ revert: true }),
                }
              : { label: t('manage.cancel'), onClick: onClose }
          }
          primary={{
            label: t('manage.save'),
            onClick: save,
            loading: edit.isPending,
            disabled:
              !question.trim() || (!labelled && !answer.trim()) || !!problem,
          }}
        />
      }
    >
      <Stack gap={2}>
        <ReportList reports={reports} />
        {card.type === 'zones' ? (
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('edit.zone', { zone: card.question, image: card.image })}
          </Typography>
        ) : (
          field(
            t(labelled ? 'edit.instruction' : 'edit.question'),
            <Textarea
              minRows={2}
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />,
          )
        )}
        {!labelled &&
          field(
            t(card.type === 'zones' ? 'edit.zoneName' : 'edit.answer'),
            <Input value={answer} onChange={e => setAnswer(e.target.value)} />,
          )}
        <LabelRows type={card.type} labels={labels} onChange={setLabels} />
        {problem && (
          <Typography level='body-sm' color='warning'>
            {t(`labels.problems.${problem}`)}
          </Typography>
        )}
        {withTraps &&
          field(
            t('edit.traps'),
            <Textarea
              minRows={2}
              value={traps}
              placeholder={t('edit.trapsHelp')}
              onChange={e => setTraps(e.target.value)}
            />,
          )}
        {variants &&
          field(
            t(dictation ? 'edit.spellings' : 'edit.others'),
            <Textarea
              minRows={2}
              value={others}
              placeholder={t(
                dictation ? 'edit.spellingsHelp' : 'edit.othersHelp',
              )}
              onChange={e => setOthers(e.target.value)}
            />,
          )}
        {variants && (
          <ToleranceSelect value={tolerance} onChange={setTolerance} />
        )}
        <MoreOptions start={hasOptions(extras)}>
          <CardOptionFields
            type={card.type}
            extras={extras}
            onChange={setExtras}
            traps={withTraps ? lines(traps) : []}
          />
        </MoreOptions>
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {t('edit.keyHelp', { key: card.cle || `${moduleId}:${card.id}` })}
        </Typography>
        {original && (
          <Sheet variant='soft' sx={{ borderRadius: 'lg', p: 1.25 }}>
            <Typography level='title-sm'>{t('edit.original')}</Typography>
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {original.question}
            </Typography>
            {original.reponse && (
              <Typography level='body-sm' sx={{ fontWeight: 600 }}>
                {original.reponse}
              </Typography>
            )}
          </Sheet>
        )}
      </Stack>
    </ResponsiveModal>
  )
}

CardEditor.propTypes = {
  card: PropTypes.object.isRequired,
  moduleId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  original: PropTypes.object,
  reports: PropTypes.array,
}

export default CardEditor
