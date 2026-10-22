import { Add, Delete } from '@mui/icons-material'
import {
  Box,
  Button,
  Card,
  Dropdown,
  FormControl,
  FormHelperText,
  FormLabel,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  Typography,
} from '@mui/joy'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import NumberInput from '../../components/common/NumberInput'

export default function CompletionActionsSection({
  onPointsChange,
  onRequireApprovalChange,
  onValidate,
  points,
  requireApproval = false,
  showHeading = true,
}) {
  const { t } = useTranslation('chores')
  const hasPoints = points !== -1
  const pointsValid =
    !hasPoints || (Number.isInteger(points) && points >= 0 && points <= 1000)
  useEffect(() => {
    onValidate(pointsValid)
  }, [points])
  return (
    <Box mb={3}>
      {showHeading && (
        <Typography level='h4'>{t('taskEditor.onCompletion')}</Typography>
      )}
      <Typography level='body-sm' mb={1}>
        {t('taskEditor.awardPointsWhenThis')}
      </Typography>
      {hasPoints && (
        <Card variant='outlined' sx={{ mb: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography level='title-md'>
              {t('taskEditor.awardPoints')}
            </Typography>
            <IconButton
              aria-label={t('taskEditor.removePointsAction')}
              onClick={() => onPointsChange(-1)}
            >
              <Delete />
            </IconButton>
          </Box>
          <FormControl error={!pointsValid}>
            <FormLabel>{t('choreEdit.pointsPlaceholder')}</FormLabel>
            <NumberInput
              value={points}
              min={0}
              max={1000}
              onValueChange={onPointsChange}
            />
            <FormHelperText>
              {pointsValid
                ? t('taskEditor.pointsHelp')
                : t('taskEditor.pointsInvalid')}
            </FormHelperText>
          </FormControl>
        </Card>
      )}
      {requireApproval && (
        <Card variant='outlined' sx={{ mb: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box>
              <Typography level='title-md'>
                {t('choreEdit.requireApproval')}
              </Typography>
              <Typography level='body-sm' textColor='text.tertiary'>
                {t('choreEdit.requireApprovalHelp')}
              </Typography>
            </Box>
            <IconButton
              aria-label={t('taskEditor.removeApprovalAction')}
              onClick={() => onRequireApprovalChange(false)}
            >
              <Delete />
            </IconButton>
          </Box>
        </Card>
      )}
      <Dropdown>
        <MenuButton
          slots={{ root: Button }}
          slotProps={{
            root: { variant: 'outlined', size: 'sm', startDecorator: <Add /> },
          }}
        >
          {t('taskEditor.addAction')}
        </MenuButton>
        <Menu>
          <MenuItem disabled={hasPoints} onClick={() => onPointsChange(1)}>
            {t('taskEditor.awardPoints')}
          </MenuItem>
          <MenuItem
            disabled={requireApproval}
            onClick={() => onRequireApprovalChange(true)}
          >
            {t('choreEdit.requireApproval')}
          </MenuItem>
        </Menu>
      </Dropdown>
    </Box>
  )
}
