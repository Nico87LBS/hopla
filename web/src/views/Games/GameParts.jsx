import { Avatar } from '@mui/joy'
import PropTypes from 'prop-types'

import { resolvePhotoURL } from '../../utils/Helpers'

export const surfaceSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'xl',
  p: { xs: 2, sm: 2.5 },
}

export const memberShape = PropTypes.shape({
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
    sx={{ '--Avatar-size': `${size}px` }}
  >
    {member?.displayName?.charAt(0)}
  </Avatar>
)

MemberAvatar.propTypes = { member: memberShape, size: PropTypes.number }
