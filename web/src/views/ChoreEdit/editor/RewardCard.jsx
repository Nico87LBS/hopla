import {
  AddRounded,
  RemoveRounded,
  StarRounded,
  TimerRounded,
} from '@mui/icons-material'
import { Box, IconButton, Switch, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import NumberInput from '../../../components/common/NumberInput'
import { HOPLA } from '../../../constants/theme'
import EditorCard from './EditorCard'

const PRESETS = [0, 2, 5, 10, 20]
const MAX_HOPS = 1000
const MAX_CHRONO_MINUTES = 720

// Gold is for hops only; a softer gold reads on the dark background.
const goldText = theme => ({
  color: HOPLA.goldText,
  [theme.getColorSchemeSelector('dark')]: { color: '#FFC933' },
})
const goldSoft = theme => ({
  bgcolor: HOPLA.goldSoft,
  [theme.getColorSchemeSelector('dark')]: {
    bgcolor: 'rgba(255, 201, 51, 0.14)',
  },
})

const chronoInputSx = {
  width: 64,
  minHeight: 36,
  '& input': { textAlign: 'center', fontWeight: 600 },
}

// "Reward": the hops the task gives, its speed bonus (extra hops when done at
// most some minutes after the due time) and whether a parent approves it
// first. No hops is stored as -1, as before; no speed bonus as 0.
export default function RewardCard({
  chronoAfter,
  error,
  flashMinutes,
  flashPoints,
  onFlashChange,
  onPointsChange,
  onRequireApprovalChange,
  onValidate,
  perSlot,
  points,
  requireApproval,
}) {
  const { t } = useTranslation('chores')
  const hops = points > 0 ? points : 0
  const chrono = Boolean(chronoAfter) && flashPoints > 0
  const valid =
    (points === -1 ||
      (Number.isInteger(points) && points >= 0 && points <= MAX_HOPS)) &&
    (!chrono ||
      (flashPoints <= MAX_HOPS &&
        Number.isInteger(flashMinutes) &&
        flashMinutes >= 1 &&
        flashMinutes <= MAX_CHRONO_MINUTES))
  useEffect(() => {
    onValidate(valid)
  }, [valid])
  const set = value =>
    onPointsChange(value > 0 ? Math.min(value, MAX_HOPS) : -1)

  return (
    <EditorCard section='reward' title={t('editor.reward.title')} error={error}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={theme => ({
              ...goldSoft(theme),
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
            })}
          >
            <StarRounded sx={{ color: HOPLA.gold, fontSize: 22 }} />
          </Box>
          <Box>
            <Typography level='title-sm' id='editor-hops-label'>
              {t('editor.reward.hops')}
            </Typography>
            <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
              {perSlot
                ? t('editor.reward.perSlot')
                : t('editor.reward.perTime')}
            </Typography>
          </Box>
        </Box>
        <Box
          sx={theme => ({
            ...goldSoft(theme),
            display: 'flex',
            alignItems: 'center',
            borderRadius: '14px',
            p: '2px',
          })}
        >
          <IconButton
            variant='plain'
            aria-label={t('editor.reward.less')}
            disabled={hops === 0}
            onClick={() => set(hops - 1)}
            sx={theme => ({ ...goldText(theme), minWidth: 44, minHeight: 44 })}
          >
            <RemoveRounded />
          </IconButton>
          <NumberInput
            variant='plain'
            aria-labelledby='editor-hops-label'
            min={0}
            max={MAX_HOPS}
            value={hops}
            selectOnFocus
            onValueChange={value => set(Number(value) || 0)}
            sx={theme => ({
              ...goldText(theme),
              width: 64,
              '--Input-paddingInline': '0px',
              minHeight: 44,
              bgcolor: 'transparent',
              '--Input-focusedThickness': '0px',
              '& input': {
                textAlign: 'center',
                fontFamily: 'display',
                fontSize: 22,
                fontWeight: 600,
                color: 'inherit',
              },
            })}
          />
          <IconButton
            variant='plain'
            aria-label={t('editor.reward.more')}
            disabled={hops >= MAX_HOPS}
            onClick={() => set(hops + 1)}
            sx={theme => ({ ...goldText(theme), minWidth: 44, minHeight: 44 })}
          >
            <AddRounded />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        {PRESETS.map(value => {
          const selected = value === hops
          return (
            <Box
              key={value}
              component='button'
              type='button'
              aria-pressed={selected}
              aria-label={t('editor.reward.preset', { count: value })}
              onClick={() => set(value)}
              sx={theme => ({
                flex: 1,
                minHeight: 36,
                border: '1px solid',
                borderColor: selected ? HOPLA.gold : 'divider',
                borderRadius: '10px',
                bgcolor: 'background.surface',
                color: 'text.secondary',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                ...(selected && { ...goldSoft(theme), ...goldText(theme) }),
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.500',
                },
              })}
            >
              {value}
            </Box>
          )
        })}
      </Box>
      {chronoAfter && (
        <>
          <Box sx={{ height: '1px', bgcolor: 'divider' }} />
          <Box
            component='label'
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              minHeight: 44,
              cursor: 'pointer',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <TimerRounded sx={{ color: HOPLA.violet, fontSize: 22 }} />
              <Box>
                <Typography level='title-sm'>
                  {t('editor.reward.chrono')}
                </Typography>
                <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                  {t('editor.reward.chronoHelp')}
                </Typography>
              </Box>
            </Box>
            <Switch
              checked={chrono}
              onChange={e =>
                onFlashChange({
                  points: e.target.checked ? 5 : 0,
                  minutes: flashMinutes || 15,
                })
              }
            />
          </Box>
          {chrono && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                columnGap: 1,
                rowGap: 0.75,
              }}
            >
              <NumberInput
                size='sm'
                aria-label={t('editor.reward.chronoPoints')}
                min={1}
                max={MAX_HOPS}
                value={flashPoints}
                selectOnFocus
                onValueChange={value =>
                  onFlashChange({
                    points: Math.max(1, Number(value) || 1),
                    minutes: flashMinutes,
                  })
                }
                sx={chronoInputSx}
              />
              <Typography level='body-sm'>
                {t('editor.reward.chronoRuleStart')}
              </Typography>
              <NumberInput
                size='sm'
                aria-label={t('editor.reward.chronoMinutes')}
                min={1}
                max={MAX_CHRONO_MINUTES}
                value={flashMinutes}
                selectOnFocus
                onValueChange={value =>
                  onFlashChange({
                    points: flashPoints,
                    minutes: Math.max(1, Number(value) || 1),
                  })
                }
                sx={chronoInputSx}
              />
              <Typography level='body-sm'>
                {t('editor.reward.chronoRuleEnd', {
                  after:
                    chronoAfter === 'Slot'
                      ? t('editor.reward.chronoAfterSlot')
                      : chronoAfter === 'Signal'
                        ? t('editor.reward.chronoAfterSignal')
                        : t('editor.reward.chronoAfterDue'),
                })}
              </Typography>
            </Box>
          )}
        </>
      )}
      <Box sx={{ height: '1px', bgcolor: 'divider' }} />
      <Box
        component='label'
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          minHeight: 44,
          cursor: 'pointer',
        }}
      >
        <Box>
          <Typography level='title-sm'>
            {t('editor.reward.approval')}
          </Typography>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {t('editor.reward.approvalHelp')}
          </Typography>
        </Box>
        <Switch
          checked={requireApproval}
          onChange={e => onRequireApprovalChange(e.target.checked)}
        />
      </Box>
    </EditorCard>
  )
}

RewardCard.propTypes = {
  chronoAfter: PropTypes.oneOf(['Due', 'Slot', 'Signal']),
  error: PropTypes.node,
  flashMinutes: PropTypes.number,
  flashPoints: PropTypes.number,
  onFlashChange: PropTypes.func.isRequired,
  onPointsChange: PropTypes.func.isRequired,
  onRequireApprovalChange: PropTypes.func.isRequired,
  onValidate: PropTypes.func.isRequired,
  perSlot: PropTypes.bool,
  points: PropTypes.number,
  requireApproval: PropTypes.bool,
}
