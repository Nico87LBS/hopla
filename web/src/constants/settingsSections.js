// Every setting of the app and the Gérer page that holds it, for search and
// for the old /settings/<id> links. Titles/descriptions live in
// locales/settings.json under `overview.sections.<id>`, keyed off the same ids.
export const SETTINGS_SECTIONS = [
  { id: 'profile', to: '/manage/account' },
  { id: 'family', to: '/manage/family', parentOnly: true },
  { id: 'account', to: '/manage/account/security', parentOnly: true },
  { id: 'subaccounts', to: '/manage/family/children', parentOnly: true },
  { id: 'mfa', to: '/manage/account/security', parentOnly: true },
  { id: 'apitokens', to: '/manage/advanced', parentOnly: true },
  { id: 'calendar', to: '/manage/advanced' },
  { id: 'storage', to: '/manage/advanced' },
  // Tasks, rewards and games as a file, to set up another family quickly.
  { id: 'template', to: '/manage/advanced', parentOnly: true },
  { id: 'layout', to: '/manage/account/appearance' },
  { id: 'theme', to: '/manage/account/appearance' },
  { id: 'localization', to: '/manage/account/appearance' },
  { id: 'advanced', to: '/manage/advanced' },
]
