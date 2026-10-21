import moment from 'moment'
import { createContext, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import useStickyState from '@/hooks/useStickyState'

const LocalizationContext = createContext()

export const DATE_FORMATS = {
  MDY: 'MM/DD/YYYY',
  DMY: 'DD/MM/YYYY',
  YMD: 'YYYY-MM-DD',
  LONG: 'MMMM D, YYYY',
  SHORT: 'MMM D, YYYY',
}

export const TIME_FORMATS = {
  HOUR_12: 'h:mm A',
  HOUR_24: 'HH:mm',
}

export const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur']

// Sensible regional defaults applied when the user switches language.
// These are only a starting point — the user can still override any of
// them individually afterwards.
export const LANGUAGE_DEFAULTS = {
  en: {
    dateFormat: DATE_FORMATS.MDY,
    timeFormat: TIME_FORMATS.HOUR_12,
    firstDayOfWeek: 0,
  },
  fr: {
    dateFormat: DATE_FORMATS.DMY,
    timeFormat: TIME_FORMATS.HOUR_24,
    firstDayOfWeek: 1,
  },
}

export const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
]

// Until someone picks a language, follow the browser's when we have it.
const browserLanguage = () => {
  const code = (navigator.language || 'en').split('-')[0]
  return AVAILABLE_LANGUAGES.some(language => language.code === code)
    ? code
    : 'en'
}

export const LocalizationProvider = ({ children }) => {
  const { i18n, t } = useTranslation()
  const initialLanguage = browserLanguage()
  const initialDefaults = LANGUAGE_DEFAULTS[initialLanguage]
  const [dateFormat, setDateFormat] = useStickyState(
    initialDefaults.dateFormat,
    'dateFormat',
  )
  const [timeFormat, setTimeFormat] = useStickyState(
    initialDefaults.timeFormat,
    'timeFormat',
  )
  const [firstDayOfWeek, setFirstDayOfWeek] = useStickyState(
    initialDefaults.firstDayOfWeek,
    'firstDayOfWeek',
  ) // 0 = Sunday, 1 = Monday
  const [language, setLanguageRaw] = useStickyState(initialLanguage, 'language')

  const setLanguage = code => {
    setLanguageRaw(code)
    const defaults =
      LANGUAGE_DEFAULTS[code] || LANGUAGE_DEFAULTS[code.split('-')[0]]
    if (defaults) {
      setDateFormat(defaults.dateFormat)
      setTimeFormat(defaults.timeFormat)
      setFirstDayOfWeek(defaults.firstDayOfWeek)
    }
  }

  useEffect(() => {
    i18n.changeLanguage(language)
    moment.locale(language)
  }, [language, i18n])

  useEffect(() => {
    const isRTL = RTL_LANGUAGES.some(
      rtlLanguage =>
        language === rtlLanguage || language.startsWith(`${rtlLanguage}-`),
    )
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr'
    document.documentElement.lang = language
  }, [language])

  const formatDate = (date, format = dateFormat) => {
    if (!date) return ''
    return moment(date).format(format)
  }

  const formatDateTime = (date, format) => {
    if (!date) return ''
    const dateTimeFormat = format || `${dateFormat} ${timeFormat}`
    return moment(date).format(dateTimeFormat)
  }

  const formatTime = (date, format = timeFormat) => {
    if (!date) return ''
    return moment(date).format(format)
  }

  const formatRelative = date => {
    if (!date) return ''
    return moment(date).fromNow()
  }

  const formatCalendar = date => {
    if (!date) return ''
    return moment(date).calendar(null, {
      sameDay: `${t('momentCalendar.today')} ${timeFormat}`,
      nextDay: `${t('momentCalendar.tomorrow')} ${timeFormat}`,
      nextWeek: `dddd ${timeFormat}`,
      lastDay: `${t('momentCalendar.yesterday')} ${timeFormat}`,
      lastWeek: `${t('momentCalendar.lastWeek')} ${timeFormat}`,
      sameElse: `${dateFormat} ${timeFormat}`,
    })
  }

  const isRTL = RTL_LANGUAGES.some(
    rtlLanguage =>
      language === rtlLanguage || language.startsWith(`${rtlLanguage}-`),
  )

  const fmt = {
    date: formatDate,
    dateTime: formatDateTime,
    time: formatTime,
    relative: formatRelative,
    calendar: formatCalendar,
  }

  const value = {
    dateFormat,
    setDateFormat,
    timeFormat,
    setTimeFormat,
    firstDayOfWeek,
    setFirstDayOfWeek,
    language,
    setLanguage,
    isRTL,
    fmt,
    availableLanguages: AVAILABLE_LANGUAGES,
  }

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  )
}

export const useLocalization = () => {
  const context = useContext(LocalizationContext)
  if (!context) {
    throw new Error('useLocalization must be used within LocalizationProvider')
  }
  return context
}
