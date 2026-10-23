import {
  BoltRounded,
  PeopleAltRounded,
  PersonRounded,
} from '@mui/icons-material'
import { Box, useColorScheme } from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

// How a task shared by several people works, each with its own colour and
// symbol so it reads the same everywhere: each one has their own copy, the
// first one to do it does it for everyone, or one person at a time.
const TASK_MODES = {
  each: { Icon: PeopleAltRounded, light: '#2B58B0', dark: '#8FB2F2' },
  first: { Icon: BoltRounded, light: '#B4470F', dark: '#FFA46B' },
  one: { Icon: PersonRounded, light: '#5B5770', dark: '#B7B3C9' },
}

export const TaskModeIcon = ({ mode, size = 14 }) => {
  const { mode: scheme } = useColorScheme()
  const { Icon, dark, light } = TASK_MODES[mode]
  return (
    <Icon
      aria-hidden='true'
      sx={{ color: scheme === 'dark' ? dark : light, fontSize: size }}
    />
  )
}

TaskModeIcon.propTypes = {
  mode: PropTypes.oneOf(Object.keys(TASK_MODES)).isRequired,
  size: PropTypes.number,
}

const TaskMode = ({ mode }) => {
  const { t } = useTranslation('chores')
  const { mode: scheme } = useColorScheme()
  if (!mode) return null
  const { dark, light } = TASK_MODES[mode]
  return (
    <Box
      component='span'
      sx={{
        alignItems: 'center',
        color: scheme === 'dark' ? dark : light,
        display: 'inline-flex',
        fontWeight: 600,
        gap: 0.375,
        '& svg': { color: 'inherit' },
      }}
    >
      <TaskModeIcon mode={mode} size={13} />
      {t(`taskMode.${mode}`)}
    </Box>
  )
}

TaskMode.propTypes = {
  mode: PropTypes.oneOf(Object.keys(TASK_MODES)),
}

export default TaskMode
