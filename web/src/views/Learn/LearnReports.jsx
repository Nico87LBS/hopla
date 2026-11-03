import {
  ArrowBackRounded,
  EditRounded,
  FileDownloadRounded,
  OutlinedFlagRounded,
} from '@mui/icons-material'
import { Box, Button, Chip, Sheet, Stack, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useLearnDetail, useLearnReports } from '../../queries/LearnQueries'
import { cardAnswer } from '../../utils/learn/generators'
import { groupReports } from '../../utils/learn/reports'
import LoadingComponent from '../components/Loading'
import { surfaceSx } from '../Games/GameParts'
import { ParentPage } from '../Manage/ParentPages'
import CardEditor, { ReportList } from './CardEditor'
import { useExportReports, useNotify } from './ManageLearn'

// FixCard opens the correction of a written card, as the module has it for
// the family now, with its reports.
const FixCard = ({ cardId, moduleId, onClose }) => {
  const { data } = useLearnDetail(moduleId)
  if (!data) return null
  const card = (data.documents || [])
    .flatMap(doc => doc.fiches || [])
    .find(c => c.id === cardId)
  if (!card) return null
  return (
    <CardEditor
      card={card}
      moduleId={moduleId}
      original={
        (data.edits || []).find(e => e.module === moduleId && e.card === cardId)
          ?.original
      }
      reports={(data.reports || []).filter(
        r => r.module === moduleId && r.card === cardId,
      )}
      onClose={onClose}
    />
  )
}

FixCard.propTypes = {
  cardId: PropTypes.string.isRequired,
  moduleId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
}

// The card as the family has it now: the module's own, or the family's
// correction of it. A question made by the game has none.
const useCurrentCard = (moduleId, written) => {
  const { data } = useLearnDetail(moduleId)
  if (!written) return {}
  const card = (data?.documents || [])
    .flatMap(doc => doc.fiches || [])
    .find(c => c.id === written.id)
  const edited = (data?.edits || []).some(
    e => e.module === moduleId && e.card === written.id,
  )
  return { card: card || written, edited }
}

const QuestionRow = ({ moduleId, onFix, question }) => {
  const { t } = useTranslation('learn')
  const { card, edited } = useCurrentCard(moduleId, question.card)
  return (
    <Stack
      gap={1}
      sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.25 }}
    >
      <Stack direction='row' gap={1} alignItems='flex-start'>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='body-sm'>
            {card ? card.question : question.prompt}
          </Typography>
          <Typography level='title-sm' sx={{ color: HOPLA.violet }}>
            {card ? cardAnswer(card) : question.expected}
          </Typography>
          {edited && (
            <Chip size='sm' variant='soft' color='primary' sx={{ mt: 0.5 }}>
              {t('detail.edited')}
            </Chip>
          )}
          {!card && (
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
              {t('reports.generated')}
            </Typography>
          )}
        </Box>
        {card && (
          <Button
            size='sm'
            variant='soft'
            startDecorator={<EditRounded />}
            onClick={() => onFix(moduleId, card.id)}
          >
            {t('reports.fix')}
          </Button>
        )}
      </Stack>
      <ReportList reports={question.reports} />
    </Stack>
  )
}

QuestionRow.propTypes = {
  moduleId: PropTypes.string.isRequired,
  onFix: PropTypes.func.isRequired,
  question: PropTypes.object.isRequired,
}

// /manage/learn/signalements: every question reported in the games, by
// module, to correct on the spot or to mark as looked at.
const LearnReports = () => {
  const { t } = useTranslation('learn')
  const notify = useNotify()
  const { data, error, isLoading } = useLearnReports()
  const [exportAll, exporting] = useExportReports()
  // The card being corrected: { moduleId, cardId }.
  const [fixing, setFixing] = useState(null)
  const modules = useMemo(() => groupReports(data), [data])
  const count = data?.length || 0

  return (
    <ParentPage page='learn'>
      <Stack direction='row' alignItems='center' gap={1} flexWrap='wrap'>
        <Button
          component={Link}
          to='/manage/learn'
          variant='plain'
          color='neutral'
          startDecorator={<ArrowBackRounded />}
        >
          {t('reports.back')}
        </Button>
        <Box sx={{ flex: 1 }} />
        {count > 0 && (
          <Button
            variant='soft'
            startDecorator={<FileDownloadRounded />}
            loading={exporting}
            onClick={() =>
              exportAll().catch(err => notify('error', err.message))
            }
          >
            {t('reports.export')}
          </Button>
        )}
      </Stack>
      <Typography level='h3' startDecorator={<OutlinedFlagRounded />}>
        {count > 0 ? t('reports.title', { count }) : t('reports.pageTitle')}
      </Typography>
      {isLoading && <LoadingComponent />}
      {error && <Typography color='danger'>{error.message}</Typography>}
      {!isLoading && !error && count === 0 && (
        <Sheet sx={surfaceSx}>
          <Typography level='body-md'>{t('reports.none')}</Typography>
        </Sheet>
      )}
      {modules.map(module => (
        <Sheet key={module.id} sx={surfaceSx}>
          <Stack gap={1.25}>
            <Stack direction='row' alignItems='center' gap={1}>
              <Typography level='title-md' sx={{ flex: 1 }}>
                {module.name}
              </Typography>
              <Button
                component={Link}
                to={`/manage/learn/detail/${module.id}`}
                size='sm'
                variant='plain'
              >
                {t('reports.seeModule')}
              </Button>
            </Stack>
            {module.questions.map(question => (
              <QuestionRow
                key={question.key}
                moduleId={module.id}
                question={question}
                onFix={(moduleId, cardId) => setFixing({ moduleId, cardId })}
              />
            ))}
          </Stack>
        </Sheet>
      ))}
      {fixing && (
        <FixCard
          cardId={fixing.cardId}
          moduleId={fixing.moduleId}
          onClose={() => setFixing(null)}
        />
      )}
    </ParentPage>
  )
}

export default LearnReports
