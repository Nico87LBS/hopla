import 'moment-timezone'

import moment from 'moment'

// Every date of the family follows one time zone, the family's, whatever the
// zone of the device in hand: a parent's tablet can stay in UTC while the
// children's follows the family on holiday. Until the server says, the zone
// last seen on this device is used, then the device's.

const STORAGE_KEY = 'familyTimezone'

export const deviceTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const knownZone = zone => !!zone && !!moment.tz.zone(zone)

const savedZone = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

let familyZone = knownZone(savedZone()) ? savedZone() : deviceTimezone()
moment.tz.setDefault(familyZone)

export const familyTimezone = () => familyZone

// Sets the family's zone; returns whether it changed.
export const setFamilyTimezone = zone => {
  if (!knownZone(zone) || zone === familyZone) return false
  familyZone = zone
  moment.tz.setDefault(zone)
  try {
    localStorage.setItem(STORAGE_KEY, zone)
  } catch {
    // Private browsing: the zone is fetched again next time.
  }
  return true
}

// The family's calendar day of a date, as YYYY-MM-DD.
export const familyDay = date => moment(date).format('YYYY-MM-DD')

// The calendar day a date picker or a calendar tile means: those build their
// dates at midnight on the device, whatever its zone.
export const pickedDay = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// A day picked on the device, as the family's midnight of that day.
export const fromPickedDay = date => moment(pickedDay(date), 'YYYY-MM-DD')

// The family's day as a device date at midnight, for date pickers and
// calendar tiles.
export const toPickedDay = date => {
  const m = moment(date)
  return new Date(m.year(), m.month(), m.date())
}

// The name of a zone for people: its city and its offset now, such as
// "Lisbon (UTC+01:00)".
export const zoneLabel = zone => {
  if (!knownZone(zone)) return zone
  const city = zone.includes('/')
    ? zone.split('/').pop().replace(/_/g, ' ')
    : zone
  return `${city} (UTC${moment.tz(zone).format('Z')})`
}

// The zone's city alone, such as "Lisbon".
export const zoneCity = zone =>
  zone && zone.includes('/') ? zone.split('/').pop().replace(/_/g, ' ') : zone
