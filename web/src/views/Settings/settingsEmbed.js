import { createContext } from 'react'

// Inside a Gérer page the settings are a tab or a section of that page:
// the page draws the title, so SettingsLayout only adds what it is asked to.
//   'tab'     → the content alone
//   'section' → a section title above the content
export const SettingsEmbedContext = createContext(null)
