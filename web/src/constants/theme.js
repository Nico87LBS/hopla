import resolveConfig from 'tailwindcss/resolveConfig'

import tailwindConfig from '/tailwind.config.mjs'

export const { theme: THEME } = resolveConfig(tailwindConfig)

export const COLORS = THEME.colors

export const THEME_BACKGROUND = {
  dark: '#16132B',
  light: '#F7F5F1',
}

// The Hopla palette, drawn from the logo. Each colour has one job: violet for
// actions and progress, gold only for hops and stars, carrot for the games
// (bonus periods, surprise, streaks), green for what is done or earned.
export const HOPLA = {
  ink: '#241E4E',
  blueberry: '#3E2F86',
  violet: '#5B4FE0',
  violetSoft: '#ECEAFE',
  gold: '#F5B400',
  goldText: '#7A5200',
  goldSoft: '#FFF4CC',
  carrot: '#FF7A2F',
  carrotText: '#B4470F',
  carrotSoft: '#FFF1E6',
  green: '#23934F',
  greenText: '#1D6B3B',
  greenSoft: '#E3F6EA',
  red: '#B42318',
  redSoft: '#FDECEC',
}

// Member colours for avatars without a photo: all keep white initials readable.
export const MEMBER_COLORS = [
  '#C93F68',
  '#1F7F74',
  '#3E2F86',
  '#2B63B5',
  '#B4470F',
  '#7A3FA8',
  '#2F7D32',
  '#8A5A00',
]

export const memberColor = userId =>
  MEMBER_COLORS[Math.abs(Number(userId) || 0) % MEMBER_COLORS.length]

// The chosen tab of a tab bar. In the dark the surface is darker than the bar,
// which made the chosen tab look switched off, so there it gets lighter, with
// white bold text and a violet line underneath.
export const selectedTabSx = theme => ({
  '&.Mui-selected': {
    bgcolor: 'background.surface',
    boxShadow: 'sm',
    [theme.getColorSchemeSelector('dark')]: {
      bgcolor: 'background.level3',
      boxShadow: `0 1px 3px rgba(0, 0, 0, 0.4), inset 0 -2px 0 #8F84FF`,
      color: '#fff',
      fontWeight: 700,
    },
  },
})
