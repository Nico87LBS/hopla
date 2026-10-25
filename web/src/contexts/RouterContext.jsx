import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import App from '@/App'
import ChoreEdit from '@/views/ChoreEdit/ChoreEdit'
import Error from '@/views/Error'
import AccountSettings from '@/views/Settings/AccountSettings'
import AdvancedSettings from '@/views/Settings/AdvancedSettings'
import ChildUserSettings from '@/views/Settings/ChildUserSettings'
import CircleSettings from '@/views/Settings/CircleSettings'
import SettingsOverview from '@/views/Settings/SettingsOverview'
import SettingsRoutes from '@/views/Settings/SettingsRoutes'
import ThemeSettings from '@/views/Settings/ThemeSettings'

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
import FilterView from '../views/Filters/FilterView'
import ChoreHistory from '../views/History/ChoreHistory'
import LabelDetailView from '../views/Labels/LabelDetailView'
import LabelView from '../views/Labels/LabelView'
import { LearnChooser, LearnHome } from '../views/Learn/LearnHome'
import LearnPlay from '../views/Learn/LearnPlay'
import LearnStats from '../views/Learn/LearnStats'
import ManageLearn from '../views/Learn/ManageLearn'
import ManageView from '../views/Manage/ManageView'
import {
  ManageGames,
  ManagePoints,
  ManageRanks,
  ManageReset,
} from '../views/Manage/ParentPages'
import CircleSetupView from '../views/Onboarding/CircleSetupView'
import ProjectView from '../views/Projects/ProjectView'
import APITokenSettings from '../views/Settings/APITokenSettings'
import CalendarSettings from '../views/Settings/CalendarSettings'
import LayoutSettings from '../views/Settings/LayoutSettings'
import LocalizationSettings from '../views/Settings/LocalizationSettings'
import MFASettings from '../views/Settings/MFASettings'
import ProfileSettings from '../views/Settings/ProfileSettings'
import StorageSettings from '../views/Settings/StorageSettings'
import TemplateSettings from '../views/Settings/TemplateSettings'
import ShopView from '../views/Shop/ShopView'
import TimerDetails from '../views/Timer/TimerDetails'
import UserActivities from '../views/User/UserActivities'
const PointsRedirect = () => {
  const tab = new URLSearchParams(window.location.search).get('tab')
  const to =
    tab === 'rewards' || tab === 'requests'
      ? '/shop'
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
        path: '/settings',
        element: <SettingsRoutes />,
        children: [
          {
            index: true,
            element: <SettingsOverview />,
          },
          {
            path: 'profile',
            element: <ProfileSettings />,
          },
          {
            path: 'circle',
            element: <CircleSettings />,
          },
          {
            path: 'account',
            element: <AccountSettings />,
          },
          {
            path: 'subaccounts',
            element: <ChildUserSettings />,
          },
          {
            path: 'mfa',
            element: <MFASettings />,
          },
          {
            path: 'apitokens',
            element: <APITokenSettings />,
          },
          {
            path: 'calendar',
            element: <CalendarSettings />,
          },
          {
            path: 'storage',
            element: <StorageSettings />,
          },
          {
            path: 'template',
            element: <TemplateSettings />,
          },
          {
            path: 'layout',
            element: <LayoutSettings />,
          },
          {
            path: 'theme',
            element: <ThemeSettings />,
          },
          {
            path: 'localization',
            element: <LocalizationSettings />,
          },
          {
            path: 'advanced',
            element: <AdvancedSettings />,
          },
        ],
      },
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
        path: '/activities',
        element: <UserActivities />,
      },
      {
        path: '/family',
        element: <FamilyView />,
      },
      {
        path: '/shop',
        element: <ShopView />,
      },
      {
        path: '/manage',
        element: <ManageView />,
      },
      {
        path: '/manage/points',
        element: <ManagePoints />,
      },
      {
        path: '/manage/games',
        element: <ManageGames />,
      },
      {
        path: '/manage/ranks',
        element: <ManageRanks />,
      },
      {
        path: '/manage/reset',
        element: <ManageReset />,
      },
      {
        path: '/manage/learn',
        element: <ManageLearn />,
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
        element: <Navigate to='/shop' replace />,
      },
      {
        path: 'projects/',
        element: <ProjectView />,
      },
      {
        path: 'filters/',
        element: <FilterView />,
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
