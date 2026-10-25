import { Box, Container, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useContext } from 'react'

import { SettingsEmbedContext } from './settingsEmbed'

const SettingsLayout = ({ children, title }) => {
  const embed = useContext(SettingsEmbedContext)

  if (embed === 'tab') return children
  if (embed === 'section') {
    return (
      <Box component='section'>
        <Typography level='title-lg' sx={{ mb: 1.5 }}>
          {title}
        </Typography>
        {children}
      </Box>
    )
  }

  return (
    <Container>
      <Box sx={{ py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Typography level='h2' sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
        </Box>
        {children}
      </Box>
    </Container>
  )
}

SettingsLayout.propTypes = {
  children: PropTypes.node,
  title: PropTypes.node,
}

export default SettingsLayout
