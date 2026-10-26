import { Add, HorizontalRule } from '@mui/icons-material'
import { Box, Chip, MenuItem, Option, Select } from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { getTextColorFromBackgroundColor } from '../../../utils/Colors.jsx'
import Priorities from '../../../utils/Priorities.jsx'
import { FieldLabel } from './EditorCard'

// The labels of a task.
export const LabelsField = ({
  labels,
  onAddLabel,
  onLabelsChange,
  userLabels,
}) => {
  const { t } = useTranslation('chores')
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <FieldLabel id='editor-labels-label'>
          {t('choreEdit.labels')}
        </FieldLabel>
        <Select
          multiple
          aria-labelledby='editor-labels-label'
          placeholder={t('taskEditor.addLabels')}
          value={labels?.map(l => l.name) || []}
          onChange={(_, names) =>
            onLabelsChange(userLabels.filter(l => names.includes(l.name)))
          }
          renderValue={() => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {labels.map(label => (
                <Chip
                  key={label.id}
                  sx={{
                    background: label.color,
                    color: getTextColorFromBackgroundColor(label.color),
                  }}
                >
                  {label.name}
                </Chip>
              ))}
            </Box>
          )}
          slotProps={{ listbox: { sx: { width: '100%' } } }}
        >
          {userLabels.map(label => (
            <Option key={label.id + label.name} value={label.name}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: label.color,
                }}
              />
              {label.name}
            </Option>
          ))}
          <MenuItem onClick={onAddLabel}>
            <Add />
            {t('choreEdit.addNewLabel')}
          </MenuItem>
        </Select>
      </Box>
    </Box>
  )
}

LabelsField.propTypes = {
  labels: PropTypes.array,
  onAddLabel: PropTypes.func.isRequired,
  onLabelsChange: PropTypes.func.isRequired,
  userLabels: PropTypes.array.isRequired,
}

export const priorityName = (priority, t) =>
  priority
    ? Priorities.find(item => item.value === priority)?.name.trim()
    : t('taskEditor.noPriority')

// The priority of a task, none by default.
export const PriorityField = ({ onChange, priority }) => {
  const { t } = useTranslation('chores')
  return (
    <Select
      aria-label={t('choreEdit.priority')}
      value={priority}
      onChange={(_, value) => value !== null && onChange(value)}
      startDecorator={
        Priorities.find(item => item.value === priority)?.icon || (
          <HorizontalRule />
        )
      }
    >
      <Option value={0}>{t('taskEditor.noPriority')}</Option>
      {Priorities.map(item => (
        <Option key={item.value} value={item.value}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: item.color ? `${item.color}.500` : 'text.primary',
            }}
          >
            {item.icon}
            {item.name.trim()}
          </Box>
        </Option>
      ))}
    </Select>
  )
}

PriorityField.propTypes = {
  onChange: PropTypes.func.isRequired,
  priority: PropTypes.number,
}
