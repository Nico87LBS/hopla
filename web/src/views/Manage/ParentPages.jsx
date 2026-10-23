import { Container, Stack, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'

import { useIsParent } from '../../hooks/useIsParent'
import { useCircleMembers } from '../../queries/UserQueries'
import LoadingComponent from '../components/Loading'
import { PeriodsCard, RulesCard, useGamesToday } from '../Games/DailyGames'
import {
  AdjustCard,
  HistoryCard,
  PresetsCard,
  usePointsPresets,
} from '../Games/PointsCards'
import {
  ChallengesCard,
  QuestListCard,
  RankSettingsCard,
} from '../Games/Progression'
import ResetCard from '../Games/ResetCard'

const useMembers = () => {
  const { data } = useCircleMembers()
  return useMemo(
    () => (data?.res || []).filter(m => m.isActive !== false),
    [data?.res],
  )
}

// The parent space: only parents get in, everyone else goes back to Gérer.
const ParentPage = ({ children, page }) => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  if (isParent === undefined) return <LoadingComponent />
  if (!isParent) return <Navigate to='/manage' replace />
  return (
    <Container
      maxWidth='md'
      sx={{ px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 3 } }}
    >
      <Typography
        level='h2'
        sx={{ display: { xs: 'none', lg: 'block' }, mb: 2 }}
      >
        {t(`manage.items.${page}.title`)}
      </Typography>
      <Stack gap={2}>{children}</Stack>
    </Container>
  )
}

ParentPage.propTypes = {
  children: PropTypes.node.isRequired,
  page: PropTypes.string.isRequired,
}

export const ManagePoints = () => {
  const members = useMembers()
  const { data: presets = [] } = usePointsPresets()
  return (
    <ParentPage page='points'>
      <AdjustCard members={members} presets={presets} />
      <PresetsCard presets={presets} />
      <HistoryCard members={members} />
    </ParentPage>
  )
}

export const ManageGames = () => {
  const members = useMembers()
  const { data: today } = useGamesToday()
  return (
    <ParentPage page='games'>
      <QuestListCard members={members} />
      <ChallengesCard isParent members={members} today={today} />
      <PeriodsCard />
    </ParentPage>
  )
}

export const ManageRanks = () => (
  <ParentPage page='ranks'>
    <RankSettingsCard />
    <RulesCard />
  </ParentPage>
)

export const ManageReset = () => {
  const members = useMembers()
  return (
    <ParentPage page='reset'>
      <ResetCard members={members} />
    </ParentPage>
  )
}
