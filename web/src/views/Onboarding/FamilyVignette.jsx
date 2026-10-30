import { PeopleAltRounded, Repeat } from '@mui/icons-material'
import { Box, Typography } from '@mui/joy'
import { useTranslation } from 'react-i18next'

import { getTextColorFromBackgroundColor } from '../../utils/Colors.jsx'

/**
 * A small living preview of a shared task, shown when a family is created or
 * joined. The base style is always the finished state and the keyframes say
 * how it got there, so `prefers-reduced-motion` still reads correctly.
 */

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
// One shared cycle length so the pills, the card and the caption of a vignette
// all change on the same beat.
const CYCLE_MS = 5400

const reducedMotion = {
  '@media (prefers-reduced-motion: reduce)': {
    '&, & *': { animation: 'none !important' },
  },
}

const cardSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 20,
  boxShadow: 'sm',
}

const Stage = ({ children }) => (
  <Box
    aria-hidden='true'
    sx={{
      position: 'relative',
      width: '100%',
      maxWidth: 320,
      mx: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 1.5,
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: '-16% -12%',
        borderRadius: '50%',
        bgcolor: 'primary.softBg',
        opacity: 0.55,
        filter: 'blur(28px)',
        zIndex: 0,
      },
      '& > *': { position: 'relative', zIndex: 1 },
      ...reducedMotion,
    }}
  >
    {children}
  </Box>
)

const Chip = ({ children, color = 'primary', icon, sx }) => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.5,
      px: 0.875,
      py: 0.25,
      borderRadius: '999px',
      bgcolor: `${color}.softBg`,
      color: color === 'neutral' ? 'text.secondary' : `${color}.softColor`,
      fontSize: '0.6875rem',
      fontWeight: 600,
      lineHeight: 1.6,
      whiteSpace: 'nowrap',
      '& svg': { fontSize: '0.875rem' },
      ...sx,
    }}
  >
    {icon}
    {children}
  </Box>
)

// Mirrors CompactChoreCard's solid, label-coloured chip (not the soft-tinted
// `Chip` above) so a MiniChoreCard can fake a real label instead of a generic tag.
const LabelChip = ({ color, label, sx }) => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      alignSelf: 'flex-start',
      px: 0.75,
      py: 0.125,
      borderRadius: '999px',
      fontSize: '0.625rem',
      fontWeight: 700,
      lineHeight: 1.6,
      whiteSpace: 'nowrap',
      bgcolor: color,
      color: getTextColorFromBackgroundColor(color),
      ...sx,
    }}
  >
    {label}
  </Box>
)

const getName = name => {
  const split = Array.from(name)
  // if the first character is emoji then remove it from the name
  if (isNaN(Number(split[0])) && /\p{Emoji}/u.test(split[0])) {
    return split.slice(1).join('').trim()
  }
  return name
}

/**
 * ChoreCard in miniature: the chips ride on top of the card's edge exactly as
 * they do in the task list.
 */
const MiniChoreCard = ({
  due,
  dueColor = 'primary',
  footer,
  label,
  labelColor = '#5c6bc0',
  repeat,
  title,
}) => (
  <Box>
    <Box sx={{ display: 'flex', gap: 0.5, ml: 1.25, mb: -1.25, zIndex: 2 }}>
      <Chip color={dueColor}>{due}</Chip>
      {repeat && (
        <Chip color='neutral' icon={<Repeat />}>
          {repeat}
        </Chip>
      )}
    </Box>

    <Box sx={{ ...cardSx, p: 1.75, display: 'flex', gap: 1.25 }}>
      <Box
        sx={{
          flex: '0 0 auto',
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'neutral.softBg',
          color: 'text.primary',
          fontSize: '1rem',
          fontWeight: 600,
        }}
      >
        {Array.from(title)[0]}
      </Box>
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography level='title-sm' noWrap sx={{ fontWeight: 600 }}>
          {getName(title)}
        </Typography>
        {label && (
          <LabelChip label={label} color={labelColor} sx={{ mt: 0.375 }} />
        )}
        {footer}
      </Box>
    </Box>
  </Box>
)

const AssigneeChip = ({ color = 'primary', name, sx }) => (
  <Box
    sx={{
      mt: 0.5,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.625,
      alignSelf: 'flex-start',
      pl: 0.25,
      pr: 1,
      py: 0.25,
      borderRadius: '999px',
      border: '1px solid',
      borderColor: 'divider',
      fontSize: '0.6875rem',
      fontWeight: 500,
      color: 'text.secondary',
      ...sx,
    }}
  >
    <Box
      sx={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: '0.625rem',
        fontWeight: 700,
        bgcolor: `${color}.softBg`,
        color: 'text.primary',
      }}
    >
      {Array.from(name)[0]}
    </Box>
    {name}
  </Box>
)

// Stacks its children in one grid cell and cross-fades between them, so the
// container never resizes as the content changes. The keyframes are derived
// from the child count so a two-up cycler holds each state twice as long
// instead of leaving a third of the cycle blank.
const Cycler = ({ children, cycleMs = CYCLE_MS, sx }) => {
  const items = Array.isArray(children) ? children : [children]
  const count = items.length
  const step = cycleMs / count
  const hold = 100 / count
  // Emotion emits inline @keyframes under the literal name, so each arity
  // needs its own or the two definitions collide.
  const name = `cycleSwap${count}`

  return (
    <Box sx={{ display: 'grid', ...sx }}>
      {items.map((child, index) => (
        <Box
          key={index}
          sx={{
            gridArea: '1 / 1',
            opacity: index === 0 ? 1 : 0,
            animation: `${name} ${cycleMs}ms ${EASE} ${index * step}ms infinite both`,
            [`@keyframes ${name}`]: {
              '0%': { opacity: 0, transform: 'translateY(6px)' },
              '4%': { opacity: 1, transform: 'none' },
              [`${hold - 4}%`]: { opacity: 1, transform: 'none' },
              [`${hold + 1}%`]: { opacity: 0, transform: 'translateY(-6px)' },
              '100%': { opacity: 0, transform: 'translateY(-6px)' },
            },
            ...sx?.item,
          }}
        >
          {child}
        </Box>
      ))}
    </Box>
  )
}

/* ----------------------------------------------- slide 4: share the load */

const MEMBERS = [
  { initial: 'M', name: 'Mo', color: 'primary' },
  { initial: 'A', name: 'Amalie', color: 'success' },
  { initial: 'S', name: 'Sam', color: 'warning' },
]

const AVATAR = 40
const AVATAR_GAP = 12
const STEP = AVATAR + AVATAR_GAP

export const FamilyVignette = () => {
  const { t } = useTranslation('common')
  return (
    <Stage>
      <MiniChoreCard
        title={t('onboarding.family.kitchenTitle')}
        due={t('onboarding.family.kitchenDue')}
        repeat={t('onboarding.family.kitchenRepeat')}
        footer={
          <Cycler>
            {MEMBERS.map(member => (
              <AssigneeChip
                key={member.name}
                name={member.name}
                color={member.color}
              />
            ))}
          </Cycler>
        }
      />

      <Box
        sx={{
          ...cardSx,
          px: 1.75,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            gap: `${AVATAR_GAP}px`,
          }}
        >
          {/* Selection ring hopping between members: the rotating assignee. */}
          <Box
            sx={{
              position: 'absolute',
              top: -4,
              left: -4,
              width: AVATAR + 8,
              height: AVATAR + 8,
              borderRadius: '50%',
              border: '2px solid',
              borderColor: 'primary.500',
              animation: `ringHop ${CYCLE_MS}ms ${EASE} infinite both`,
              '@keyframes ringHop': {
                '0%, 28%': { transform: 'translateX(0)' },
                '33%, 61%': { transform: `translateX(${STEP}px)` },
                '66%, 94%': { transform: `translateX(${STEP * 2}px)` },
                '100%': { transform: 'translateX(0)' },
              },
            }}
          />
          {MEMBERS.map(member => (
            <Box
              key={member.name}
              sx={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.9375rem',
                fontWeight: 700,
                bgcolor: `${member.color}.softBg`,
                // The soft palettes' own text colours land near 2:1 on their
                // soft backgrounds; ink keeps the initials legible.
                color: 'text.primary',
              }}
            >
              {member.initial}
            </Box>
          ))}
        </Box>

        <Chip icon={<PeopleAltRounded />} color='neutral'>
          {t('onboarding.family.takesTurns')}
        </Chip>
      </Box>
    </Stage>
  )
}
