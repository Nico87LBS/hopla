import { LuggageRounded } from '@mui/icons-material'
import { Avatar, Box } from '@mui/joy'
import PropTypes from 'prop-types'

import { memberColor } from '../../constants/theme'
import { resolvePhotoURL } from '../../utils/Helpers'

export const surfaceSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'xl',
  p: { xs: 2, sm: 2.5 },
}

export const memberShape = PropTypes.shape({
  away: PropTypes.bool,
  displayName: PropTypes.string,
  image: PropTypes.string,
  points: PropTypes.number,
  pointsRedeemed: PropTypes.number,
  role: PropTypes.string,
  userId: PropTypes.number,
})

export const MemberAvatar = ({ member, size = 28 }) => (
  <Avatar
    src={resolvePhotoURL(member?.image)}
    sx={{
      '--Avatar-size': `${size}px`,
      bgcolor: memberColor(member?.userId),
      color: '#fff',
      fontSize: size * 0.4,
      fontWeight: 600,
    }}
  >
    {member?.displayName?.charAt(0)}
  </Avatar>
)

MemberAvatar.propTypes = { member: memberShape, size: PropTypes.number }

// The heads of everyone a task is for, overlapping a little.
export const MemberAvatars = ({ members, size = 28 }) => (
  <Box
    sx={{ display: 'flex', flexShrink: 0 }}
    title={members.map(member => member.displayName).join(', ')}
  >
    {members.map((member, index) => (
      <Box
        key={member.userId}
        sx={{
          ml: index ? `${-size / 3}px` : 0,
          borderRadius: '50%',
          boxShadow: index
            ? '0 0 0 2px var(--joy-palette-background-surface)'
            : 'none',
        }}
      >
        <MemberAvatar member={member} size={size} />
      </Box>
    ))}
  </Box>
)

MemberAvatars.propTypes = {
  members: PropTypes.arrayOf(memberShape).isRequired,
  size: PropTypes.number,
}

// A small grey pill with a suitcase and the days a member was away.
export const AwayPill = ({ days, label }) => (
  <Box
    component='span'
    title={label}
    aria-label={label}
    sx={{
      alignItems: 'center',
      bgcolor: 'background.level2',
      borderRadius: 999,
      color: 'text.secondary',
      display: 'inline-flex',
      flexShrink: 0,
      font: '600 11px/16px var(--joy-fontFamily-body)',
      gap: 0.25,
      px: 0.75,
    }}
  >
    <LuggageRounded aria-hidden sx={{ fontSize: 12 }} />
    {days}
  </Box>
)

AwayPill.propTypes = {
  days: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
}
