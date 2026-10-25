import {
  LeaderboardRounded,
  RedeemRounded,
  TaskAltRounded,
  TuneRounded,
} from '@mui/icons-material'

import { useIsParent } from '../../hooks/useIsParent'
import { useRedemptions } from '../Rewards/RewardQueries'

// The four places of the app. Everything that is set up rather than looked at
// lives under Gérer, so these paths light up the Gérer entry too.
const MANAGE_PATHS = [
  '/manage',
  '/settings',
  '/projects',
  '/labels',
  '/filters',
  '/archived',
  '/activities',
  '/learn',
]

const startsWithPath = (pathname, path) =>
  pathname === path || pathname.startsWith(`${path}/`)

export const MAIN_DESTINATIONS = [
  {
    id: 'today',
    to: '/chores',
    labelKey: 'navigation.today',
    icon: <TaskAltRounded />,
    isActive: pathname =>
      pathname === '/' ||
      pathname === '/chores' ||
      pathname === '/my/chores' ||
      /^\/chores\/\d+/.test(pathname),
  },
  {
    id: 'family',
    to: '/family',
    labelKey: 'navigation.family',
    icon: <LeaderboardRounded />,
    isActive: pathname => startsWithPath(pathname, '/family'),
  },
  {
    id: 'shop',
    to: '/shop',
    labelKey: 'navigation.shop',
    icon: <RedeemRounded />,
    isActive: pathname => startsWithPath(pathname, '/shop'),
  },
  {
    id: 'manage',
    to: '/manage',
    labelKey: 'navigation.manage',
    icon: <TuneRounded />,
    isActive: pathname =>
      MANAGE_PATHS.some(path => startsWithPath(pathname, path)),
  },
]

// Badge counts on the destinations: reward requests waiting for a parent.
export const useNavigationBadges = () => {
  const isParent = useIsParent()
  const { data: pending = [] } = useRedemptions('pending')
  return { shop: isParent ? pending.length : 0 }
}
