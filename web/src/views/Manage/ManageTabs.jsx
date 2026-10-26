import { Box } from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import PageTabs from '../../components/common/PageTabs'
import { useIsParent } from '../../hooks/useIsParent'

// The tabs of each page of Gérer, by page. A tab with parentOnly is left out
// for the children.
const PAGE_TABS = {
  tasks: [
    { value: 'labels', to: '/labels' },
    { value: 'projects', to: '/projects' },
    { value: 'filters', to: '/filters' },
    { value: 'archived', to: '/archived' },
  ],
  rewards: [
    { value: 'rewards', to: '/manage/rewards' },
    { value: 'presets', to: '/manage/rewards/presets' },
  ],
  missions: [
    { value: 'quests', to: '/manage/missions' },
    { value: 'challenges', to: '/manage/missions/challenges' },
    { value: 'periods', to: '/manage/missions/periods' },
  ],
  ranks: [
    { value: 'ranks', to: '/manage/ranks' },
    { value: 'rules', to: '/manage/ranks/rules' },
  ],
  family: [
    { value: 'members', to: '/manage/family' },
    { value: 'children', to: '/manage/family/children' },
    { value: 'settings', to: '/manage/family/settings' },
  ],
  account: [
    { value: 'profile', to: '/manage/account' },
    { value: 'security', to: '/manage/account/security', parentOnly: true },
    { value: 'appearance', to: '/manage/account/appearance' },
  ],
}

export const ManageTabs = ({ current, page }) => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  const tabs = PAGE_TABS[page]
    .filter(tab => !tab.parentOnly || isParent)
    .map(tab => ({ ...tab, label: t(`manage.tabs.${page}.${tab.value}`) }))
  return <PageTabs current={current} tabs={tabs} />
}

ManageTabs.propTypes = {
  current: PropTypes.string.isRequired,
  page: PropTypes.oneOf(Object.keys(PAGE_TABS)).isRequired,
}

// The pages of the tasks keep their own layout: the tabs sit on top.
export const TasksTabs = ({ current }) => (
  <Box sx={{ px: 2, mb: 2 }}>
    <ManageTabs page='tasks' current={current} />
  </Box>
)

TasksTabs.propTypes = { current: PropTypes.string.isRequired }
