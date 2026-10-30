import { Box, Container, Stack, Typography } from '@mui/joy'
import useMediaQuery from '@mui/material/useMediaQuery'
import PropTypes from 'prop-types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'

import { useIsParent } from '../../hooks/useIsParent'
import { useCircleMembers } from '../../queries/UserQueries'
import LoadingComponent from '../components/Loading'
import { PeriodsCard, RulesCard, useGamesToday } from '../Games/DailyGames'
import { PresetsCard, usePointsPresets } from '../Games/PointsCards'
import {
  ChallengesCard,
  QuestListCard,
  RankSettingsCard,
} from '../Games/Progression'
import ResetCard from '../Games/ResetCard'
import RewardsView from '../Rewards/RewardsView'
import AccountSettings from '../Settings/AccountSettings'
import AdvancedSettings from '../Settings/AdvancedSettings'
import APITokenSettings from '../Settings/APITokenSettings'
import CalendarSettings from '../Settings/CalendarSettings'
import ChildUserSettings from '../Settings/ChildUserSettings'
import CircleSettings from '../Settings/CircleSettings'
import CurrencyCard from '../Settings/CurrencyCard'
import FamilyTimezoneCard from '../Settings/FamilyTimezoneCard'
import LocalizationSettings from '../Settings/LocalizationSettings'
import MFASettings from '../Settings/MFASettings'
import PodiumCard from '../Settings/PodiumCard'
import ProfileSettings from '../Settings/ProfileSettings'
import { SettingsEmbedContext } from '../Settings/settingsEmbed'
import SidepanelSettings from '../Settings/SidepanelSettings'
import StorageSettings from '../Settings/StorageSettings'
import TemplateSettings from '../Settings/TemplateSettings'
import ThemeSettings from '../Settings/ThemeSettings'
import { ManageTabs } from './ManageTabs'

export const useMembers = () => {
  const { data } = useCircleMembers()
  return useMemo(
    () => (data?.res || []).filter(m => m.isActive !== false),
    [data?.res],
  )
}

// A page of Gérer: its title, then its tabs, then the current tab.
// Only parents get into a parent page, everyone else goes back to Gérer.
export const ParentPage = ({ children, open, page, tabs }) => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  if (!open) {
    if (isParent === undefined) return <LoadingComponent />
    if (!isParent) return <Navigate to='/manage' replace />
  }
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
      <Stack gap={2}>
        {tabs}
        {children}
      </Stack>
    </Container>
  )
}

ParentPage.propTypes = {
  children: PropTypes.node.isRequired,
  open: PropTypes.bool,
  page: PropTypes.string.isRequired,
  tabs: PropTypes.node,
}

const TabPage = ({ children, current, open, page }) => (
  <ParentPage
    open={open}
    page={page}
    tabs={<ManageTabs page={page} current={current} />}
  >
    {children}
  </ParentPage>
)

TabPage.propTypes = {
  children: PropTypes.node.isRequired,
  current: PropTypes.string.isRequired,
  open: PropTypes.bool,
  page: PropTypes.string.isRequired,
}

// Settings written as their own page, shown as a tab or as sections.
const Embedded = ({ children, mode }) => (
  <SettingsEmbedContext.Provider value={mode}>
    {mode === 'section' ? <Stack gap={4}>{children}</Stack> : children}
  </SettingsEmbedContext.Provider>
)

Embedded.propTypes = {
  children: PropTypes.node.isRequired,
  mode: PropTypes.oneOf(['section', 'tab']).isRequired,
}

// Récompenses: what the shop offers, and the bonuses ready to be given
// from a child's card in Famille.
export const ManageRewards = ({ tab }) => {
  const { data: presets = [] } = usePointsPresets()
  return (
    <TabPage page='rewards' current={tab}>
      {tab === 'rewards' ? (
        <RewardsView embedded view='manage' />
      ) : (
        <PresetsCard presets={presets} />
      )}
    </TabPage>
  )
}

ManageRewards.propTypes = {
  tab: PropTypes.oneOf(['rewards', 'presets']).isRequired,
}

export const ManageMissions = ({ tab }) => {
  const members = useMembers()
  const { data: today } = useGamesToday()
  return (
    <TabPage page='missions' current={tab}>
      {tab === 'quests' && <QuestListCard members={members} />}
      {tab === 'challenges' && (
        <ChallengesCard isParent members={members} today={today} />
      )}
      {tab === 'periods' && <PeriodsCard />}
    </TabPage>
  )
}

ManageMissions.propTypes = {
  tab: PropTypes.oneOf(['quests', 'challenges', 'periods']).isRequired,
}

export const ManageRanks = ({ tab }) => (
  <TabPage page='ranks' current={tab}>
    {tab === 'ranks' ? <RankSettingsCard /> : <RulesCard />}
  </TabPage>
)

ManageRanks.propTypes = { tab: PropTypes.oneOf(['ranks', 'rules']).isRequired }

export const ManageFamily = ({ tab }) => (
  <TabPage page='family' current={tab}>
    <Embedded mode='tab'>
      {tab === 'members' && <CircleSettings />}
      {tab === 'children' && <ChildUserSettings />}
      {tab === 'settings' && (
        <Stack gap={2}>
          <CurrencyCard />
          <PodiumCard />
          <FamilyTimezoneCard />
        </Stack>
      )}
    </Embedded>
  </TabPage>
)

ManageFamily.propTypes = {
  tab: PropTypes.oneOf(['members', 'children', 'settings']).isRequired,
}

// Mon compte is for everyone; the password and the second factor are the
// parents' (the children's passwords are set from their parent's account).
export const ManageAccount = ({ tab }) => {
  const isParent = useIsParent()
  // The sidepanel only renders from `lg` up, so it is set up where it exists.
  const hasSidepanel = useMediaQuery(theme => theme.breakpoints.up('lg'))
  const { t } = useTranslation('settings')
  if (tab === 'security' && isParent === false) {
    return <Navigate to='/manage/account' replace />
  }
  return (
    <TabPage open page='account' current={tab}>
      {tab === 'profile' && (
        <Embedded mode='tab'>
          <ProfileSettings />
        </Embedded>
      )}
      {tab === 'security' && (
        <Embedded mode='section'>
          <AccountSettings />
          <MFASettings />
        </Embedded>
      )}
      {tab === 'appearance' && (
        <Embedded mode='section'>
          <ThemeSettings />
          <LocalizationSettings />
          {hasSidepanel && (
            <Box component='section'>
              <Typography level='title-lg' sx={{ mb: 1.5 }}>
                {t('layout.sidepanel.title')}
              </Typography>
              <SidepanelSettings />
            </Box>
          )}
        </Embedded>
      )}
    </TabPage>
  )
}

ManageAccount.propTypes = {
  tab: PropTypes.oneOf(['profile', 'security', 'appearance']).isRequired,
}

// Avancé: one page in sections, the reset last.
export const ManageAdvanced = () => {
  const isParent = useIsParent()
  const members = useMembers()
  return (
    <ParentPage open page='advanced'>
      <Embedded mode='section'>
        <CalendarSettings />
        {isParent && <APITokenSettings />}
        {isParent && <TemplateSettings />}
        <AdvancedSettings />
        <StorageSettings />
        {isParent && <ResetCard members={members} />}
      </Embedded>
    </ParentPage>
  )
}
