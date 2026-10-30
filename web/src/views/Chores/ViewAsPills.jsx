import { StarRounded } from '@mui/icons-material'
import { Avatar, Box, Button } from '@mui/joy'
import { useMediaQuery } from '@mui/material'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useImpersonateUser } from '../../contexts/ImpersonateUserContext'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import { membersOfDay } from '../../utils/todayPanel'
import { MemberAvatar } from '../Games/GameParts'

// Above the list on a wide screen, a parent picks whose tasks to show:
// everyone, or one child's, acting as that child so what is ticked is theirs.

const Pill = ({ face, label, onClick, selected }) => (
  <Button
    variant='plain'
    color='neutral'
    aria-pressed={selected}
    onClick={onClick}
    startDecorator={face}
    sx={theme => ({
      '--Button-gap': '6px',
      bgcolor: selected ? 'background.surface' : 'transparent',
      borderRadius: 999,
      boxShadow: selected ? 'sm' : 'none',
      color: 'text.primary',
      fontWeight: selected ? 700 : 600,
      minHeight: 34,
      pl: 0.5,
      pr: 1.5,
      '&:hover, &[aria-pressed="true"]': {
        bgcolor: selected ? 'background.surface' : 'background.level2',
      },
      [theme.getColorSchemeSelector('dark')]: selected && {
        bgcolor: 'background.level3',
        color: '#fff',
        '&:hover, &[aria-pressed="true"]': { bgcolor: 'background.level3' },
      },
    })}
  >
    {label}
  </Button>
)

Pill.propTypes = {
  face: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  selected: PropTypes.bool.isRequired,
}

const ViewAsPills = ({ onPick }) => {
  const { t } = useTranslation('chores')
  const isLargeScreen = useMediaQuery(theme => theme.breakpoints.up('lg'))
  const { data: userProfile } = useUserProfile()
  const { data: membersData } = useFamilyMembers()
  const {
    canImpersonate,
    impersonatedUser,
    startImpersonation,
    stopImpersonation,
  } = useImpersonateUser()
  const all = membersData?.res || []
  const children = membersOfDay(all).filter(
    member => member.userId !== userProfile?.id,
  )
  if (
    !isLargeScreen ||
    children.length === 0 ||
    !canImpersonate(userProfile, all)
  ) {
    return null
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
      <Box
        role='group'
        aria-label={t('viewAs.label')}
        sx={{
          bgcolor: 'background.level1',
          borderRadius: 999,
          display: 'flex',
          gap: 0.75,
          p: 0.5,
        }}
      >
        <Pill
          face={
            <Avatar sx={{ '--Avatar-size': '26px', bgcolor: HOPLA.blueberry }}>
              <StarRounded sx={{ color: '#fff', fontSize: 16 }} />
            </Avatar>
          }
          label={t('viewAs.everyone')}
          selected={!impersonatedUser}
          onClick={() => {
            stopImpersonation()
            onPick(null)
          }}
        />
        {children.map(member => (
          <Pill
            key={member.userId}
            face={<MemberAvatar member={member} size={26} />}
            label={member.displayName}
            selected={impersonatedUser?.userId === member.userId}
            onClick={() => {
              startImpersonation(member, userProfile)
              onPick(member)
            }}
          />
        ))}
      </Box>
    </Box>
  )
}

ViewAsPills.propTypes = { onPick: PropTypes.func.isRequired }

export default ViewAsPills
