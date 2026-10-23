import {
  ListItem,
  ListItemButton,
  ListItemDecorator,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'

const NavBarLink = ({ link }) => {
  const { active = false, badge, icon, label, onClick, to } = link

  return (
    <ListItem
      sx={{ '--ListItem-paddingX': '0px', '--ListItem-paddingY': '0px', p: 0 }}
    >
      <ListItemButton
        {...(onClick ? { onClick } : { component: Link, to })}
        aria-current={active ? 'page' : undefined}
        variant={active ? 'soft' : 'plain'}
        color={active ? 'primary' : 'neutral'}
        sx={{
          borderRadius: 'md',
          '--ListItem-minHeight': '44px',
          px: 1.5,
          width: '100%',
          transition: 'background-color 160ms ease, color 160ms ease',
          '& .MuiListItemDecorator-root': {
            color: active ? 'primary.plainColor' : 'text.tertiary',
            minInlineSize: 34,
          },
          '& svg': { fontSize: 21 },
        }}
      >
        <ListItemDecorator>{icon}</ListItemDecorator>
        <Typography
          level='body-sm'
          sx={{ color: 'inherit', flex: 1, fontWeight: active ? 600 : 500 }}
        >
          {label}
        </Typography>
        {badge > 0 && (
          <Typography
            level='body-xs'
            sx={{
              bgcolor: HOPLA.carrot,
              borderRadius: 999,
              color: HOPLA.ink,
              fontWeight: 700,
              minWidth: 20,
              px: 0.75,
              textAlign: 'center',
            }}
          >
            {badge}
          </Typography>
        )}
      </ListItemButton>
    </ListItem>
  )
}

NavBarLink.propTypes = {
  link: PropTypes.shape({
    active: PropTypes.bool,
    badge: PropTypes.number,
    icon: PropTypes.node.isRequired,
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func,
    to: PropTypes.string,
  }).isRequired,
}

export default NavBarLink
