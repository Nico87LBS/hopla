import { Check } from '@mui/icons-material'
import {
  Box,
  Button,
  Option,
  Select,
  Typography,
  useColorScheme,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { TaskModeIcon } from '../../../components/common/TaskMode'
import { memberColor } from '../../../constants/theme'
import { MemberAvatar } from '../../Games/GameParts'
import EditorCard, { FieldLabel } from './EditorCard'

// The colours of TaskMode, for the border, tint and text of a picked mode.
const MODE_COLORS = {
  each: {
    border: '#2B58B0',
    bg: 'rgba(43, 88, 176, 0.12)',
    light: '#2B58B0',
    dark: '#8FB2F2',
  },
  first: {
    border: '#FF7A2F',
    bg: 'rgba(255, 122, 47, 0.14)',
    light: '#B4470F',
    dark: '#FFA46B',
  },
  one: {
    border: '#8A86A0',
    bg: 'rgba(91, 87, 112, 0.12)',
    light: '#5B5770',
    dark: '#B7B3C9',
  },
}

// A member to pick: their face, ringed in their colour when picked.
const MemberToggle = ({ member, onToggle, selected }) => (
  <Box
    component='button'
    type='button'
    aria-pressed={selected}
    onClick={onToggle}
    sx={{
      border: 0,
      background: 'transparent',
      p: 0.5,
      minWidth: 64,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0.75,
      cursor: 'pointer',
      font: 'inherit',
      fontSize: 13,
      fontWeight: selected ? 600 : 500,
      color: selected ? 'text.primary' : 'text.tertiary',
      borderRadius: '12px',
      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.500' },
    }}
  >
    <Box
      sx={{
        position: 'relative',
        borderRadius: '50%',
        boxShadow: selected
          ? theme =>
              `0 0 0 3px ${theme.vars.palette.background.surface}, 0 0 0 5px ${memberColor(member.userId)}`
          : 'none',
        filter: selected ? 'none' : 'grayscale(1)',
        opacity: selected ? 1 : 0.45,
      }}
    >
      <MemberAvatar member={member} size={48} />
      {selected && (
        <Box
          aria-hidden='true'
          sx={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 20,
            height: 20,
            borderRadius: '50%',
            bgcolor: 'primary.solidBg',
            color: 'primary.solidColor',
            border: '2px solid',
            borderColor: 'background.surface',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Check sx={{ fontSize: 13 }} />
        </Box>
      )}
    </Box>
    {member.displayName}
  </Box>
)

MemberToggle.propTypes = {
  member: PropTypes.object.isRequired,
  onToggle: PropTypes.func.isRequired,
  selected: PropTypes.bool,
}

// "For whom?": the people the task is for and, for several, how they share it.
export default function WhoCard({
  assignStrategy,
  assignedTo,
  copyOwner,
  error,
  help,
  isSelected,
  members,
  mode,
  modes,
  note,
  onAssignStrategyChange,
  onAssignedToChange,
  onModeChange,
  onRememberDefault,
  onToggle,
  picked,
  strategies,
}) {
  const { t } = useTranslation('chores')
  const { mode: scheme } = useColorScheme()
  const modeText = value =>
    MODE_COLORS[value][scheme === 'dark' ? 'dark' : 'light']
  return (
    <EditorCard section='who' title={t('editor.who.title')} error={error}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {members.map(member => (
          <MemberToggle
            key={member.userId}
            member={member}
            selected={isSelected(member.userId)}
            onToggle={() => onToggle(member.userId)}
          />
        ))}
      </Box>
      {picked.length === 0 && (
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          {t('editor.who.anyone')}
        </Typography>
      )}
      {note && (
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {note}
        </Typography>
      )}
      {onRememberDefault && (
        <Button
          size='sm'
          variant='plain'
          onClick={onRememberDefault}
          sx={{ alignSelf: 'flex-start', px: 1, ml: -1 }}
        >
          {t('editor.who.remember')}
        </Button>
      )}

      {copyOwner && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TaskModeIcon mode='each' size={20} />
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            <Box
              component='span'
              sx={{ fontWeight: 600, color: modeText('each') }}
            >
              {t('taskMode.each')}
            </Box>
            {' · '}
            {t('editor.who.copyOf', { name: copyOwner })}
          </Typography>
        </Box>
      )}

      {modes.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <FieldLabel id='editor-mode-label'>{t('editor.who.how')}</FieldLabel>
          <Box
            role='radiogroup'
            aria-labelledby='editor-mode-label'
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))`,
              gap: 0.75,
            }}
          >
            {modes.map(value => {
              const selected = value === mode
              const colors = MODE_COLORS[value]
              return (
                <Box
                  key={value}
                  component='button'
                  type='button'
                  role='radio'
                  aria-checked={selected}
                  onClick={() => onModeChange(value)}
                  sx={{
                    minHeight: 64,
                    p: 1,
                    border: selected ? '2px solid' : '1px solid',
                    borderColor: selected ? colors.border : 'divider',
                    bgcolor: selected ? colors.bg : 'background.surface',
                    color: selected ? modeText(value) : 'text.primary',
                    borderRadius: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: 12.5,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    textAlign: 'center',
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.500',
                    },
                  }}
                >
                  <TaskModeIcon mode={value} size={22} />
                  {t(`taskMode.${value}`)}
                </Box>
              )
            })}
          </Box>
          {help && (
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {help}
            </Typography>
          )}
        </Box>
      )}

      {mode === 'one' && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 1.25,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <FieldLabel id='editor-holder-label'>
              {t('editor.who.holder')}
            </FieldLabel>
            <Select
              aria-labelledby='editor-holder-label'
              value={assignedTo > -1 ? assignedTo : null}
              placeholder={t('taskEditor.selectAssignee')}
              onChange={(_, value) =>
                value != null && onAssignedToChange(value)
              }
            >
              {picked.map(member => (
                <Option key={member.userId} value={member.userId}>
                  {member.displayName}
                </Option>
              ))}
            </Select>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <FieldLabel id='editor-next-label'>
              {t('editor.who.next')}
            </FieldLabel>
            <Select
              aria-labelledby='editor-next-label'
              value={assignStrategy}
              onChange={(_, value) => value && onAssignStrategyChange(value)}
            >
              {strategies.map(value => (
                <Option key={value} value={value}>
                  {t(`taskEditor.strategy.${value}`)}
                </Option>
              ))}
            </Select>
          </Box>
        </Box>
      )}
    </EditorCard>
  )
}

WhoCard.propTypes = {
  assignedTo: PropTypes.number,
  assignStrategy: PropTypes.string,
  copyOwner: PropTypes.string,
  error: PropTypes.node,
  help: PropTypes.node,
  isSelected: PropTypes.func.isRequired,
  members: PropTypes.array.isRequired,
  mode: PropTypes.string,
  modes: PropTypes.arrayOf(PropTypes.string).isRequired,
  note: PropTypes.node,
  onAssignedToChange: PropTypes.func.isRequired,
  onAssignStrategyChange: PropTypes.func.isRequired,
  onModeChange: PropTypes.func.isRequired,
  onRememberDefault: PropTypes.func,
  onToggle: PropTypes.func.isRequired,
  picked: PropTypes.array.isRequired,
  strategies: PropTypes.arrayOf(PropTypes.string).isRequired,
}
