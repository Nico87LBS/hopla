import { FolderOpen } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'

import { ProjectAccessIcon } from '../Projects/ProjectVisibilityField'
import BaseOptionPicker from './BaseOptionPicker'

const ProjectPickerField = ({
  emptyDisplay = 'icon-text',
  onChange,
  onClear,
  projects = [],
  value = 'default',
}) => {
  const { t } = useTranslation('chores')
  const options = [
    { id: 'default', name: t('toolbar.defaultProject'), color: '#9CA3AF' },
    ...projects.map(project => ({
      id: project.id,
      name: project.name,
      color: project.color,
      isPrivate: project.isPrivate,
      visibility: project.visibility,
    })),
  ]

  return (
    <BaseOptionPicker
      items={options}
      value={value}
      onChange={onChange}
      onClear={onClear}
      emptyDisplay={emptyDisplay}
      emptyLabel={t('projectPicker.label')}
      getItemValue={item => item.id}
      getItemLabel={item => item.name}
      getItemColor={item => item.color}
      renderTriggerIcon={() => <FolderOpen sx={{ fontSize: '20px' }} />}
      renderItemStart={({ item }) => (
        <FolderOpen
          sx={{
            fontSize: '18px',
            color: item.color || 'text.secondary',
          }}
        />
      )}
      renderItemEnd={({ item }) => (
        <ProjectAccessIcon project={item} sx={{ fontSize: '14px' }} />
      )}
      getTriggerText={({ isEmpty, selectedItems }) =>
        isEmpty ? t('projectPicker.label') : selectedItems[0].name
      }
      menuMinWidth={240}
    />
  )
}

export default ProjectPickerField
