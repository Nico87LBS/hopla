import {
  ArchiveOutlined,
  AutoAwesomeRounded,
  ChevronRightRounded,
  FilterAltOutlined,
  FolderOpenOutlined,
  GroupsRounded,
  HistoryRounded,
  LabelOutlined,
  MilitaryTechRounded,
  RedeemRounded,
  RestartAltRounded,
  SchoolOutlined,
  SchoolRounded,
  SettingsOutlined,
  TollRounded,
} from '@mui/icons-material'
import {
  Box,
  Container,
  List,
  ListDivider,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Sheet,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useIsParent } from '../../hooks/useIsParent'

const GROUPS = [
  {
    id: 'learn',
    items: [{ id: 'play', to: '/learn', icon: <SchoolRounded /> }],
  },
  {
    id: 'organize',
    items: [
      { id: 'projects', to: '/projects', icon: <FolderOpenOutlined /> },
      { id: 'labels', to: '/labels', icon: <LabelOutlined /> },
      { id: 'filters', to: '/filters', icon: <FilterAltOutlined /> },
      { id: 'archived', to: '/archived', icon: <ArchiveOutlined /> },
      { id: 'activities', to: '/activities', icon: <HistoryRounded /> },
    ],
  },
  {
    id: 'parent',
    parentOnly: true,
    items: [
      { id: 'points', to: '/manage/points', icon: <TollRounded /> },
      { id: 'rewards', to: '/shop', icon: <RedeemRounded /> },
      { id: 'games', to: '/manage/games', icon: <AutoAwesomeRounded /> },
      { id: 'ranks', to: '/manage/ranks', icon: <MilitaryTechRounded /> },
      { id: 'learn', to: '/manage/learn', icon: <SchoolOutlined /> },
      { id: 'reset', to: '/manage/reset', icon: <RestartAltRounded /> },
    ],
  },
  {
    id: 'account',
    items: [
      { id: 'circle', to: '/settings/circle', icon: <GroupsRounded /> },
      { id: 'settings', to: '/settings', icon: <SettingsOutlined /> },
    ],
  },
]

const ManageRow = ({ icon, id, to }) => {
  const { t } = useTranslation('common')
  return (
    <ListItem>
      <ListItemButton component={Link} to={to} sx={{ minHeight: 56, px: 2 }}>
        <ListItemDecorator
          sx={{
            alignItems: 'center',
            bgcolor: 'background.level1',
            borderRadius: '10px',
            color: 'text.secondary',
            height: 36,
            justifyContent: 'center',
            mr: 1.5,
            width: 36,
          }}
        >
          {icon}
        </ListItemDecorator>
        <ListItemContent>
          <Typography level='title-sm'>
            {t(`manage.items.${id}.title`)}
          </Typography>
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
            {t(`manage.items.${id}.description`)}
          </Typography>
        </ListItemContent>
        <ChevronRightRounded sx={{ color: 'text.tertiary' }} />
      </ListItemButton>
    </ListItem>
  )
}

ManageRow.propTypes = {
  icon: PropTypes.node.isRequired,
  id: PropTypes.string.isRequired,
  to: PropTypes.string.isRequired,
}

// Everything that is set up rather than looked at, in four groups.
const ManageView = () => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()

  return (
    <Container
      maxWidth='sm'
      sx={{ px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 3 } }}
    >
      <Typography
        level='h2'
        sx={{ display: { xs: 'none', lg: 'block' }, mb: 1 }}
      >
        {t('navigation.manage')}
      </Typography>
      {GROUPS.filter(group => !group.parentOnly || isParent).map(group => (
        <Box component='section' key={group.id} sx={{ mt: 2.5 }}>
          <Typography
            level='body-xs'
            sx={{
              color: 'text.tertiary',
              fontWeight: 700,
              letterSpacing: '.06em',
              mb: 1,
              px: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {t(`manage.groups.${group.id}`)}
          </Typography>
          <Sheet
            variant='outlined'
            sx={{
              borderRadius: 'lg',
              overflow: 'hidden',
              bgcolor: 'background.surface',
            }}
          >
            <List
              sx={{ '--List-padding': '0px', '--ListItem-paddingX': '0px' }}
            >
              {group.items.map((item, index) => (
                <Fragment key={item.id}>
                  {index > 0 && <ListDivider inset='startContent' />}
                  <ManageRow {...item} />
                </Fragment>
              ))}
            </List>
          </Sheet>
        </Box>
      ))}
    </Container>
  )
}

export default ManageView
