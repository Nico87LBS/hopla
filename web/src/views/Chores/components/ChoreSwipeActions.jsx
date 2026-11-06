import {
  LeadingActions,
  SwipeAction,
  TrailingActions,
} from '@meauxt/react-swipeable-list'
import { Delete, Unarchive } from '@mui/icons-material'
import { Box, Typography } from '@mui/joy'
import PropTypes from 'prop-types'

import { hapticMedium } from '../../../utils/Haptics'

// The plain ChoreCard floats its priority/label chips above the card body, so
// the actions have to drop down to align with the card itself.
const PLAIN_CARD_OFFSET = '28px'

/**
 * One swipe action tile.
 *
 * Solid fills, not `softBg`. The swipe tray is the most committal gesture in
 * the app and needs to read as a set of buttons the moment it peeks out from
 * under the row; the soft tints are near-white in light mode and near-black on
 * our pure-black dark body, which made the whole tray look disabled. Solid
 * fills also sidestep dark mode entirely — only `primary` is overridden for
 * the dark scheme, so success/warning/danger `softBg` fall back to Joy's
 * defaults there and drift away from the palette.
 */
const SwipeActionTile = ({
  bgcolor,
  color = '#fff',
  icon,
  label,
  offsetTop,
}) => (
  // Two boxes on purpose. The library styles `.swipe-action > *` with
  // `flex: 1` and a `justify-content` of flex-start/flex-end depending on the
  // side — written for a row-direction child. On a column tile that would
  // shunt the icon and label to the top or bottom edge, so the outer box stays
  // a row and absorbs those rules, and the inner one owns the column layout.
  <Box
    sx={{
      display: 'flex',
      minWidth: 76,
      height: '100%',
      ...(offsetTop && { mt: PLAIN_CARD_OFFSET }),
    }}
  >
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        bgcolor,
        color,
        px: 2,
      }}
    >
      <Box sx={{ display: 'flex', '& svg': { fontSize: 22 } }}>{icon}</Box>
      <Typography
        level='body-xs'
        sx={{
          color: 'inherit',
          fontWeight: 600,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </Box>
  </Box>
)

SwipeActionTile.propTypes = {
  bgcolor: PropTypes.string.isRequired,
  color: PropTypes.string,
  icon: PropTypes.node.isRequired,
  label: PropTypes.node,
  offsetTop: PropTypes.bool,
}

// Amber at 500 is too light to carry white text; everything else clears 4.5:1
// against white.

/**
 * Leading (swipe-right) actions: complete (or approve on a row
 * awaiting review), then skip.
 *
 * Unlike TrailingActions, LeadingActions tags its *first* child as the
 * `fullSwipe` target, not its last — so complete/approve goes first to
 * stay a one-flick gesture with no aiming. Skip sits behind it, reachable
 * with a longer swipe or a tap once revealed.
 */
export const getArchivedLeadingActions = ({
  chore,
  handleChoreAction,
  isMultiSelectMode = false,
  t,
}) => {
  if (isMultiSelectMode) return null

  return (
    <LeadingActions>
      <SwipeAction
        onClick={() => {
          hapticMedium()
          handleChoreAction('restore', chore)
        }}
      >
        <SwipeActionTile
          bgcolor='success.500'
          icon={<Unarchive sx={{ color: 'white' }} />}
          label={t('archived.restore')}
        />
      </SwipeAction>
    </LeadingActions>
  )
}

export const getArchivedTrailingActions = ({
  chore,
  handleChoreAction,
  isMultiSelectMode = false,
  t,
}) => {
  if (isMultiSelectMode) return null

  return (
    <TrailingActions>
      <SwipeAction
        onClick={() => {
          hapticMedium()
          handleChoreAction('delete', chore)
        }}
      >
        <SwipeActionTile
          bgcolor='danger.500'
          icon={<Delete sx={{ color: 'white' }} />}
          label={t('archived.delete')}
        />
      </SwipeAction>
    </TrailingActions>
  )
}
