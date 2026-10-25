import {
  AccountCircle,
  Api,
  CalendarMonth,
  FamilyRestroom,
  Groups,
  ImportExport,
  Language,
  Palette,
  Person,
  Security,
  Settings,
  Storage,
  ViewSidebar,
} from '@mui/icons-material'

// Single source of truth for the settings sections: id, icon, and access
// gating. Titles/descriptions live in locales/settings.json under
// `overview.sections.<id>`, keyed off the same ids.
export const SETTINGS_SECTIONS = [
  { id: 'profile', icon: Person },
  { id: 'circle', icon: Groups, parentOnly: true },
  { id: 'account', icon: AccountCircle, parentOnly: true },
  { id: 'subaccounts', icon: FamilyRestroom },
  { id: 'mfa', icon: Security, parentOnly: true },
  { id: 'apitokens', icon: Api, parentOnly: true },
  { id: 'calendar', icon: CalendarMonth },
  { id: 'storage', icon: Storage },
  // Tasks, rewards and games as a file, to set up another family quickly.
  { id: 'template', icon: ImportExport, parentOnly: true },
  // Default landing view, plus whichever chrome this device actually has:
  // the bottom bar on mobile, the sidepanel on desktop.
  { id: 'layout', icon: ViewSidebar },
  { id: 'theme', icon: Palette },
  { id: 'localization', icon: Language, isBeta: true },
  { id: 'advanced', icon: Settings },
]
