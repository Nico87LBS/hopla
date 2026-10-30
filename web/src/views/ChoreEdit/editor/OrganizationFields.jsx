import { Add } from '@mui/icons-material'
import { Box, Chip, MenuItem, Option, Select } from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { getTextColorFromBackgroundColor } from '../../../utils/Colors.jsx'
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
