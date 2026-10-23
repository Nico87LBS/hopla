import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { CssBaseline } from '@mui/joy'
import { CssVarsProvider, extendTheme } from '@mui/joy/styles'
import PropType from 'prop-types'
import { useMemo } from 'react'
import { prefixer } from 'stylis'
import rtlPlugin from 'stylis-plugin-rtl'

import { THEME_BACKGROUND } from '@/constants/theme'

import { useLocalization } from './LocalizationContext'

// Violet scale around the action colour #5B4FE0.
const violet = {
  50: '#F3F2FE',
  100: '#ECEAFE',
  200: '#D9D5FC',
  300: '#BDB6F8',
  400: '#8F84F0',
  500: '#5B4FE0',
  600: '#4E42CC',
  700: '#4136AE',
  800: '#352C8C',
  900: '#2A2370',
}

// Warm greys that lean towards the blueberry ink of the logo.
const neutral = {
  50: '#FAF9F6',
  100: '#F1EFEA',
  200: '#E8E4DC',
  300: '#D9D4CA',
  400: '#B9B3CC',
  500: '#6B6680',
  600: '#5A5470',
  700: '#433E5C',
  800: '#2E2950',
  900: '#241E4E',
}

const success = {
  50: '#EEF9F2',
  100: '#E3F6EA',
  200: '#C3EBD1',
  300: '#8FD9AA',
  400: '#4CC77A',
  500: '#23934F',
  600: '#1F8246',
  700: '#1D6B3B',
  800: '#175530',
  900: '#114024',
}

// Gold is kept for hops and stars.
const warning = {
  50: '#FFFBEB',
  100: '#FFF4CC',
  200: '#FFE69A',
  300: '#FFD24D',
  400: '#FFC21A',
  500: '#F5B400',
  600: '#D99A00',
  700: '#8A5A00',
  800: '#7A5200',
  900: '#5C3D00',
}

const danger = {
  50: '#FEF3F2',
  100: '#FDECEC',
  200: '#FAD1CF',
  300: '#F4A8A3',
  400: '#E5675F',
  500: '#C93A3A',
  600: '#B42318',
  700: '#9B1C14',
  800: '#7A1610',
  900: '#5C100B',
}

// Fallbacks only. A parent that owns the radius (ButtonGroup, Input/Select
// decorator slots, CardActions) sets --Button-radius / --IconButton-radius and
// takes precedence, which is what keeps connected groups looking connected.
const CONTROL_RADIUS = '12px'
const ICON_BUTTON_RADIUS = '10px'

// Select and Autocomplete both render their popup through @mui/base's Popper,
// which defaults to popper.js's `absolute` strategy — the popup is laid out in
// *document* coordinates. That is fine on desktop, but inside a mobile bottom
// sheet (viewport-pinned, body scroll locked by Modal) it puts the list below
// the fold or lets an overflow:hidden ancestor clip it, so it reads as trapped
// inside the modal. `fixed` positions it in viewport space instead, which no
// ancestor can clip.
//
// Note that slotProps coming from defaultProps are not deep merged: a call site
// passing its own slotProps.listbox replaces this wholesale.
const POPUP_LISTBOX = {
  popperOptions: { strategy: 'fixed' },
  modifiers: [
    { name: 'flip', options: { padding: 8 } },
    // altAxis with tether off lets the popup shift fully back into view rather
    // than staying glued to an anchor that has no room around it.
    {
      name: 'preventOverflow',
      options: { padding: 8, altAxis: true, tether: false },
    },
  ],
  // Joy hardcodes 44vh, and vh resolves to the *large* viewport on mobile —
  // taller than what is actually on screen while the browser chrome is up.
  sx: { maxHeight: 'min(44dvh, 320px)' },
}

const themeConfig = {
  fontFamily: {
    body: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
    display:
      "Fredoka, 'Inter Variable', Inter, system-ui, -apple-system, sans-serif",
  },
  radius: {
    xs: '6px',
    sm: '8px',
    md: '10px',
    lg: '12px',
    xl: '16px',
  },
  shadow: {
    xs: 'none',
    sm: '0 1px 2px rgba(36, 30, 78, 0.06)',
    md: '0 6px 16px rgba(36, 30, 78, 0.10)',
    lg: '0 12px 28px rgba(36, 30, 78, 0.14)',
    xl: '0 20px 40px rgba(36, 30, 78, 0.18)',
  },
  typography: {
    h1: { fontWeight: 600, letterSpacing: 0 },
    h2: { fontWeight: 600, letterSpacing: 0 },
    h3: { fontWeight: 600, letterSpacing: 0 },
    h4: { fontWeight: 600, letterSpacing: 0 },
  },
  colorSchemes: {
    light: {
      palette: {
        background: {
          body: THEME_BACKGROUND.light,
          surface: '#FFFFFF',
          popup: '#FFFFFF',
          level1: neutral[100],
          level2: neutral[200],
          level3: neutral[300],
        },
        divider: neutral[200],
        text: {
          primary: neutral[900],
          secondary: neutral[600],
          tertiary: neutral[500],
        },
        primary: violet,
        neutral,
        success,
        warning,
        danger,
      },
    },
    dark: {
      palette: {
        background: {
          body: THEME_BACKGROUND.dark,
          surface: '#211D3D',
          popup: '#2A2550',
          level1: '#2A2550',
          level2: '#332E57',
          level3: '#3D3765',
        },
        divider: 'rgba(255, 255, 255, 0.10)',
        text: {
          primary: '#F3F1FA',
          secondary: '#C9C4E0',
          tertiary: '#A8A2C4',
        },
        primary: violet,
        neutral,
        success,
        warning,
        danger,
      },
    },
  },
  components: {
    JoyButton: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          minHeight:
            ownerState.size === 'lg'
              ? '44px'
              : ownerState.size === 'sm'
                ? '36px'
                : '40px',
          // Read through the CSS variable so parents that own the radius
          // (ButtonGroup, Input/Select decorators, Card actions) still win.
          borderRadius: `var(--Button-radius, ${CONTROL_RADIUS})`,
          fontWeight: 600,
          transition:
            'background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 100ms ease',
          '&:active:not(:disabled)': {
            transform: 'scale(0.98)',
          },
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
            '&:active:not(:disabled)': { transform: 'none' },
          },
        }),
      },
    },
    JoyIconButton: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: `var(--IconButton-radius, ${ICON_BUTTON_RADIUS})`,
          transition:
            'background-color 140ms ease, border-color 140ms ease, color 140ms ease, transform 100ms ease',
          '&:active:not(:disabled)': {
            transform: 'scale(0.96)',
          },
          // Touch target only for the default size. `sm`/`lg` are explicit
          // choices by the call site and keep Joy's own sizing.
          ...(ownerState.size === 'md' && {
            minWidth: '40px',
            minHeight: '40px',
            '@media (max-width: 768px)': {
              minWidth: '44px',
              minHeight: '44px',
            },
          }),
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
            '&:active:not(:disabled)': { transform: 'none' },
          },
        }),
      },
    },
    JoyButtonGroup: {
      styleOverrides: {
        root: ({ ownerState, theme }) => ({
          '--ButtonGroup-radius': CONTROL_RADIUS,
          ...(theme.direction === 'rtl' && buttonGroupRtlGeometry(ownerState)),
        }),
      },
    },
    // ToggleButtonGroup is styled(StyledButtonGroup) under its own slot name, so
    // it inherits the same geometry — and the same RTL problem — but not the
    // JoyButtonGroup override. Its radius is left at Joy's default on purpose;
    // only the direction-sensitive geometry needs correcting.
    JoyToggleButtonGroup: {
      styleOverrides: {
        root: ({ ownerState, theme }) =>
          theme.direction === 'rtl' ? buttonGroupRtlGeometry(ownerState) : {},
      },
    },
    JoySelect: { defaultProps: { slotProps: { listbox: POPUP_LISTBOX } } },
    JoyAutocomplete: {
      defaultProps: { slotProps: { listbox: POPUP_LISTBOX } },
    },
  },
}

// Joy packs a ButtonGroup's direction-sensitive geometry into CSS custom
// properties: --Button-radius as a four-corner shorthand, --Button-margin as the
// negative overlap that collapses the seam between siblings. stylis-plugin-rtl
// mirrors real properties only — it cannot know what a custom property will end
// up feeding — so those two survive into RTL still in LTR order, while the
// separator borders declared alongside them *do* flip. The result is rounded
// corners on the wrong ends and the overlap pulling the wrong way. Re-mirror
// them here. Vertical groups have no horizontal geometry, so they are left be.
const GROUP_RADIUS = 'var(--ButtonGroup-radius)'
const CHILD_RADIUS = 'var(--unstable_childRadius)'
const OVERLAP = 'calc(var(--ButtonGroup-separatorSize) * -1)'

// Corners read clockwise from top-left. [data-first-child] is the DOM-first
// button, which in RTL renders at the *right* end of the group, so it is the one
// that needs its right corners rounded — and vice versa for [data-last-child].
const ROUNDED_RIGHT = `${CHILD_RADIUS} ${GROUP_RADIUS} ${GROUP_RADIUS} ${CHILD_RADIUS}`
const ROUNDED_LEFT = `${GROUP_RADIUS} ${CHILD_RADIUS} ${CHILD_RADIUS} ${GROUP_RADIUS}`

const buttonGroupRtlGeometry = ownerState => {
  if (ownerState.orientation === 'vertical') return {}
  return {
    '& > [data-first-child]': {
      '--Button-radius': ROUNDED_RIGHT,
      '--IconButton-radius': ROUNDED_RIGHT,
    },
    '& > [data-last-child]': {
      '--Button-radius': ROUNDED_LEFT,
      '--IconButton-radius': ROUNDED_LEFT,
    },
    // Each non-first button overlaps the sibling to its right in RTL.
    '& > :not([data-first-child]):not(:only-child)': {
      '--Button-margin': `0 ${OVERLAP} 0 0`,
      '--IconButton-margin': `0 ${OVERLAP} 0 0`,
    },
  }
}

// One theme and one emotion cache per direction, built once and reused. The RTL
// cache runs every rule through stylis-plugin-rtl, which mirrors the physical
// properties (margin-left, left, text-align, translateX, …) that `sx` emits, so
// components written for LTR lay out correctly without per-component overrides.
const byDirection = {
  ltr: {
    theme: extendTheme({ ...themeConfig, direction: 'ltr' }),
    cache: createCache({ key: 'dt', stylisPlugins: [prefixer] }),
  },
  rtl: {
    theme: extendTheme({ ...themeConfig, direction: 'rtl' }),
    cache: createCache({ key: 'dt-rtl', stylisPlugins: [prefixer, rtlPlugin] }),
  },
}

const ThemeContext = ({ children }) => {
  const { isRTL } = useLocalization()
  const { cache, theme } = useMemo(
    () => byDirection[isRTL ? 'rtl' : 'ltr'],
    [isRTL],
  )

  return (
    <CacheProvider value={cache}>
      <CssVarsProvider theme={theme}>
        <CssBaseline />
        {children}
      </CssVarsProvider>
    </CacheProvider>
  )
}

ThemeContext.propTypes = {
  children: PropType.node,
}

export default ThemeContext
