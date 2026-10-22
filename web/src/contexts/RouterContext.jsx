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
import FilterView from '../views/Filters/FilterView'
import ChoreHistory from '../views/History/ChoreHistory'
import DefaultViewRoute from '../views/Home/DefaultViewRoute'
import HomeView from '../views/Home/HomeView'
import LabelDetailView from '../views/Labels/LabelDetailView'
import LabelView from '../views/Labels/LabelView'
import CircleSetupView from '../views/Onboarding/CircleSetupView'
import ProjectView from '../views/Projects/ProjectView'
import APITokenSettings from '../views/Settings/APITokenSettings'
import CalendarSettings from '../views/Settings/CalendarSettings'
import HomeSectionsSettings from '../views/Settings/HomeSectionsSettings'
import LayoutSettings from '../views/Settings/LayoutSettings'
import LocalizationSettings from '../views/Settings/LocalizationSettings'
import MFASettings from '../views/Settings/MFASettings'
import ProfileSettings from '../views/Settings/ProfileSettings'
import StorageSettings from '../views/Settings/StorageSettings'
import TemplateSettings from '../views/Settings/TemplateSettings'
import TimerDetails from '../views/Timer/TimerDetails'
import UserActivities from '../views/User/UserActivities'
import UserPoints from '../views/User/UserPoints'
const Router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <Error />,
    children: [
      {
        path: '/',
        element: <DefaultViewRoute />,
      },
      {
        path: '/home',
        element: <HomeView />,
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
            path: 'home-sections',
            element: <HomeSectionsSettings />,
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
        path: '/points',
        element: <UserPoints />,
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
        element: <Navigate to='/points?tab=rewards' replace />,
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
