import { Box, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import TaskMode from '../../../components/common/TaskMode'
import { HOPLA } from '../../../constants/theme'

const goldText = theme => ({
  color: HOPLA.goldText,
  [theme.getColorSchemeSelector('dark')]: { color: '#FFC933' },
})

// The task in one sentence, the mode and hops in their colours.
export const TaskSummary = ({ parts, sx }) => (
  <Typography level='body-sm' sx={{ color: 'text.secondary', ...sx }}>
    {parts.map((part, index) => (
      <Box component='span' key={part.kind}>
        {index > 0 && ' · '}
        {part.kind === 'mode' ? (
          <TaskMode mode={part.mode} />
        ) : part.kind === 'hops' ? (
          <Box
            component='span'
            sx={theme => ({ ...goldText(theme), fontWeight: 600 })}
          >
            {part.text}
          </Box>
        ) : (
          part.text
        )}
      </Box>
    ))}
  </Typography>
)

TaskSummary.propTypes = {
  parts: PropTypes.arrayOf(
    PropTypes.shape({
      kind: PropTypes.string,
      mode: PropTypes.string,
      text: PropTypes.node,
    }),
  ).isRequired,
  sx: PropTypes.object,
}

// On a wide screen: how the task will look in the list, what it does, and the
// buttons to save it.
export default function EditorPreview({
  actions,
  mode,
  name,
  parts,
  points,
  slots,
}) {
  const { t } = useTranslation('chores')
  return (
    <Box
      component='aside'
      aria-label={t('editor.preview.title')}
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}
    >
      <Typography
        level='body-xs'
        sx={{
          color: 'text.secondary',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {t('editor.preview.title')}
      </Typography>
      <Box
        aria-hidden='true'
        sx={{
          bgcolor: 'background.surface',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '16px',
          p: 1.75,
          display: 'flex',
          gap: 1.5,
          alignItems: 'flex-start',
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            width: 26,
            height: 26,
            mt: '2px',
            borderRadius: '50%',
            border: '2px solid',
            borderColor: 'neutral.outlinedBorder',
          }}
        />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}
        >
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
          >
            <Typography
              level='title-sm'
              sx={{
                overflowWrap: 'anywhere',
                color: name ? 'text.primary' : 'text.tertiary',
              }}
            >
              {name || t('taskEditor.whatNeedsToBeDone')}
            </Typography>
            {points > 0 && (
              <Typography
                level='title-sm'
                sx={theme => ({ ...goldText(theme), flexShrink: 0 })}
              >
                +{points}
              </Typography>
            )}
          </Box>
          {mode && (
            <Typography level='body-xs'>
              <TaskMode mode={mode} />
            </Typography>
          )}
          {slots.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {slots.map((slot, index) => (
                <Box
                  key={index}
                  sx={{
                    px: 1.25,
                    height: 24,
                    lineHeight: '24px',
                    borderRadius: '12px',
                    fontSize: 12,
                    fontWeight: 600,
                    bgcolor:
                      index === 0 ? 'primary.softBg' : 'background.level1',
                    color: index === 0 ? 'primary.softColor' : 'text.secondary',
                  }}
                >
                  {slot.name || slot.time}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <TaskSummary parts={parts} sx={{ fontSize: 14, lineHeight: 1.5 }} />
      {actions}
    </Box>
  )
}

EditorPreview.propTypes = {
  actions: PropTypes.node,
  mode: PropTypes.string,
  name: PropTypes.string,
  parts: PropTypes.array.isRequired,
  points: PropTypes.number,
  slots: PropTypes.array.isRequired,
}
