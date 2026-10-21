import 'moment/dist/locale/fr'

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['fr', 'en'],
    nonExplicitSupportedLngs: true,
    debug: import.meta.env.DEV,
    returnEmptyString: false,
    interpolation: {
      escapeValue: false,
    },

    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    ns: [
      'auth',
      'common',
      'settings',
      'chores',
      'labels',
      'history',
      'filters',
      'things',
      'projects',
      'timer',
      'points',
      'rewards',
      'games',
    ],
    defaultNS: 'common',

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    react: {
      useSuspense: true,
    },
  })

export default i18n
