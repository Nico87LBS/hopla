import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import App from '@/App'
import { SETTINGS_SECTIONS } from '@/constants/settingsSections'
import ChoreEdit from '@/views/ChoreEdit/ChoreEdit'
import Error from '@/views/Error'

import GlobalSearchPage from '../search/GlobalSearchPage'
import AuthenticationLoading from '../views/Authorization/Authenticating'
import ForgotPasswordView from '../views/Authorization/ForgotPasswordView'
import LoginView from '../views/Authorization/LoginView'
import SignupView from '../views/Authorization/Signup'
import UpdatePasswordView from '../views/Authorization/UpdatePasswordView'
import ChoreView from '../views/ChoreEdit/ChoreView'
import ArchivedTasks from '../views/Chores/ArchivedTasks'
import MyChores from '../views/Chores/MyChores'
import JoinCircleView from '../views/Circles/JoinCircle'
import NotFound from '../views/components/NotFound'
import FamilyView from '../views/Family/FamilyView'
import ChoreHistory from '../views/History/ChoreHistory'
import LabelDetailView from '../views/Labels/LabelDetailView'
import LabelView from '../views/Labels/LabelView'
import LearnDetail from '../views/Learn/LearnDetail'
import { LearnChooser, LearnHome } from '../views/Learn/LearnHome'
import LearnPlay from '../views/Learn/LearnPlay'
import LearnStats from '../views/Learn/LearnStats'
import ManageLearn, { LearnCatalogue } from '../views/Learn/ManageLearn'
import ManageView from '../views/Manage/ManageView'
import {
  ManageAccount,
  ManageAdvanced,
  ManageFamily,
  ManageMissions,
  ManageRanks,
  ManageRewards,
} from '../views/Manage/ParentPages'
import CircleSetupView from '../views/Onboarding/CircleSetupView'
import TimerDetails from '../views/Timer/TimerDetails'
const PointsRedirect = () => {
  const tab = new URLSearchParams(window.location.search).get('tab')
  const to =
    tab === 'rewards' || tab === 'requests'
      ? '/family?tab=shop'
      : tab === 'games'
        ? '/family'
        : '/family?tab=journal'
  return <Navigate to={to} replace />
}

const Router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <Error />,
    children: [
      {
        path: '/',
        element: <Navigate to='/chores' replace />,
      },
      {
        path: '/home',
        element: <Navigate to='/chores' replace />,
      },
      {
        // Old links: the settings now live in the pages of Gérer.
        path: '/settings',
        element: <Navigate to='/manage' replace />,
      },
      ...SETTINGS_SECTIONS.map(({ id, to }) => ({
        path: `/settings/${id}`,
        element: <Navigate to={to} replace />,
      })),
      {
        path: '/chores',
        element: <MyChores />,
      },
      {
        path: '/search',
        element: <GlobalSearchPage />,
      },
      {
        path: '/archived',
        element: <ArchivedTasks />,
      },
      {
        path: '/chores/:choreId/edit',
        element: <ChoreEdit />,
      },
      {
        path: '/chores/:choreId',
        element: <ChoreView />,
      },
      {
        path: '/chores/create',
        element: <ChoreEdit />,
      },
      {
        path: '/chores/:choreId/history',
        element: <ChoreHistory />,
      },
      {
        path: '/chores/:choreId/timer',
        element: <TimerDetails />,
      },
      {
        path: '/my/chores',
        element: <MyChores />,
      },
      {
        // Activités is the journal of Famille now.
        path: '/activities',
        element: <Navigate to='/family?tab=journal' replace />,
      },
      {
        path: '/family',
        element: <FamilyView />,
      },
      {
        // The shop is a tab of Famille now.
        path: '/shop',
        element: <Navigate to='/family?tab=shop' replace />,
      },
      {
        path: '/manage',
        element: <ManageView />,
      },
      {
        path: '/manage/rewards',
        element: <ManageRewards tab='rewards' />,
      },
      {
        path: '/manage/rewards/presets',
        element: <ManageRewards tab='presets' />,
      },
      {
        path: '/manage/points',
        element: <Navigate to='/manage/rewards/presets' replace />,
      },
      {
        path: '/manage/missions',
        element: <ManageMissions tab='quests' />,
      },
      {
        path: '/manage/missions/challenges',
        element: <ManageMissions tab='challenges' />,
      },
      {
        path: '/manage/missions/periods',
        element: <ManageMissions tab='periods' />,
      },
      {
        path: '/manage/games',
        element: <Navigate to='/manage/missions' replace />,
      },
      {
        path: '/manage/ranks',
        element: <ManageRanks tab='ranks' />,
      },
      {
        path: '/manage/ranks/rules',
        element: <ManageRanks tab='rules' />,
      },
      {
        path: '/manage/family',
        element: <ManageFamily tab='members' />,
      },
      {
        path: '/manage/family/children',
        element: <ManageFamily tab='children' />,
      },
      {
        path: '/manage/family/settings',
        element: <ManageFamily tab='settings' />,
      },
      {
        path: '/manage/account',
        element: <ManageAccount tab='profile' />,
      },
      {
        path: '/manage/account/security',
        element: <ManageAccount tab='security' />,
      },
      {
        path: '/manage/account/appearance',
        element: <ManageAccount tab='appearance' />,
      },
      {
        path: '/manage/advanced',
        element: <ManageAdvanced />,
      },
      {
        path: '/manage/reset',
        element: <Navigate to='/manage/advanced' replace />,
      },
      {
        path: '/manage/learn',
        element: <ManageLearn />,
      },
      {
        path: '/manage/learn/catalogue',
        element: <LearnCatalogue />,
      },
      {
        path: '/manage/learn/detail/:moduleId',
        element: <LearnDetail />,
      },
      {
        path: '/manage/learn/:moduleId',
        element: <LearnStats />,
      },
      {
        path: '/learn',
        element: <LearnChooser />,
      },
      {
        path: '/learn/:userId',
        element: <LearnHome />,
      },
      {
        path: '/learn/:userId/play/:moduleId',
        element: <LearnPlay />,
      },
      {
        // Old links: the points page was split into Famille and Boutique.
        path: '/points',
        element: <PointsRedirect />,
      },
      {
        path: '/login',
        element: <LoginView />,
      },
      {
        path: '/signup',
        element: <SignupView />,
      },
      {
        path: '/circle-setup',
        element: <CircleSetupView />,
      },

      {
        path: '/auth/:provider',
        element: <AuthenticationLoading />,
      },
      {
        path: '/forgot-password',
        element: <ForgotPasswordView />,
      },
      {
        path: '/password/update',
        element: <UpdatePasswordView />,
      },
      {
        path: 'circle/join',
        element: <JoinCircleView />,
      },
      {
        path: 'labels/',
        element: <LabelView />,
      },
      {
        path: 'labels/:labelId',
        element: <LabelDetailView />,
      },
      {
        path: 'rewards/',
        element: <Navigate to='/family?tab=shop' replace />,
      },
      {
        path: 'projects/',
        element: <Navigate to='/labels' replace />,
      },
      {
        path: 'filters/',
        element: <Navigate to='/labels' replace />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
])

const RouterContext = ({ children }) => {
  return <RouterProvider router={Router} />
}

export default RouterContext
