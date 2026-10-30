import {
  AddRounded,
  DeleteOutlineRounded,
  EditRounded,
  RemoveRounded,
} from '@mui/icons-material'
import {
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  Sheet,
  Stack,
  ToggleButtonGroup,
  Typography,
} from '@mui/joy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotification } from '../../service/NotificationProvider'
import {
  AdjustPoints,
  DeletePointsPreset,
  GetPointsPresets,
  SavePointsPreset,
} from '../../utils/Fetcher'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import { MemberAvatar, memberShape, surfaceSx } from './GameParts'

const MAX_POINTS = 1000

export const usePointsPresets = () =>
  useQuery({
    queryKey: ['pointsPresets'],
    queryFn: async () => (await GetPointsPresets())?.res || [],
  })

const signed = points => (points > 0 ? `+${points}` : `${points}`)

// Gives a bonus or a penalty, from a preset or with any number of points.
// In a sheet (bare), the member is already chosen and the card has no frame.
export const AdjustCard = ({
  bare = false,
  initialUserId = null,
  members,
  presets,
}) => {
  const { t } = useTranslation('games')
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState(initialUserId)
  const [kind, setKind] = useState('bonus')
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const member = members.find(m => m.userId === userId)

  const submit = async body => {
    if (!userId || saving) return
    setSaving(true)
    try {
      const resp = await AdjustPoints({ userId, ...body })
      if (!resp.ok) throw new Error()
      const { res } = await resp.json()
      queryClient.invalidateQueries({ queryKey: ['journal'] })
      queryClient.invalidateQueries({ queryKey: ['allFamilyMembers'] })
      queryClient.invalidateQueries({ queryKey: ['familyMembers'] })
      showNotification({
        type: 'success',
        message: t(`adjust.done.${res.action}`, {
          count: res.points,
          name: member?.displayName,
        }),
      })
      setPoints('')
      setReason('')
    } catch {
      showNotification({ type: 'error', message: t('adjust.failed') })
    } finally {
      setSaving(false)
    }
  }

  const amount = Number(points)
  const validAmount = Number.isInteger(amount) && amount > 0
  const available = member
    ? (member.points || 0) - (member.pointsRedeemed || 0)
    : 0

  return (
    <Sheet sx={bare ? { bgcolor: 'transparent' } : surfaceSx}>
      {!bare && (
        <>
          <Typography level='title-lg' sx={{ mb: 0.5 }}>
            {t('adjust.title')}
          </Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 2 }}>
            {t('adjust.subtitle')}
          </Typography>
        </>
      )}

      <Stack
        direction='row'
        flexWrap='wrap'
        gap={1}
        sx={{ display: bare ? 'none' : 'flex', mb: 2 }}
      >
        {members.map(m => (
          <Chip
            key={m.userId}
            size='lg'
            variant={m.userId === userId ? 'solid' : 'soft'}
            color={m.userId === userId ? 'primary' : 'neutral'}
            onClick={() => setUserId(m.userId)}
            startDecorator={<MemberAvatar member={m} size={24} />}
          >
            {m.displayName}
          </Chip>
        ))}
      </Stack>

      {member && (
        <Typography level='body-sm' sx={{ mb: 2 }}>
          {t('adjust.available', {
            count: available,
            name: member.displayName,
          })}
        </Typography>
      )}

      {presets.length > 0 && (
        <>
          <Typography level='title-sm' sx={{ mb: 1 }}>
            {t('adjust.presets')}
          </Typography>
          <Stack direction='row' flexWrap='wrap' gap={1} sx={{ mb: 2 }}>
            {presets.map(preset => (
              <Button
                key={preset.id}
                size='sm'
                variant='soft'
                color={preset.points > 0 ? 'success' : 'danger'}
                disabled={!userId || saving}
                onClick={() => submit({ presetId: preset.id })}
              >
                {preset.name} ({signed(preset.points)})
              </Button>
            ))}
          </Stack>
        </>
      )}

      <Typography level='title-sm' sx={{ mb: 1 }}>
        {t('adjust.custom')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
        <ToggleButtonGroup
          size='sm'
          value={kind}
          onChange={(event, value) => value && setKind(value)}
        >
          <Button value='bonus' startDecorator={<AddRounded />}>
            {t('adjust.bonus')}
          </Button>
          <Button value='penalty' startDecorator={<RemoveRounded />}>
            {t('adjust.penalty')}
          </Button>
        </ToggleButtonGroup>
        <Input
          size='sm'
          type='number'
          placeholder={t('adjust.points')}
          value={points}
          onChange={event => setPoints(event.target.value)}
          slotProps={{ input: { min: 1, max: MAX_POINTS, step: 1 } }}
          sx={{ width: { sm: 110 } }}
        />
        <Input
          size='sm'
          placeholder={t('adjust.reason')}
          value={reason}
          onChange={event => setReason(event.target.value)}
          sx={{ flex: 1 }}
        />
        <Button
          size='sm'
          color={kind === 'bonus' ? 'success' : 'danger'}
          disabled={!userId || !validAmount || amount > MAX_POINTS}
          loading={saving}
          onClick={() =>
            submit({
              points: kind === 'bonus' ? amount : -amount,
              reason: reason.trim() || null,
            })
          }
        >
          {t('adjust.give')}
        </Button>
      </Stack>
      {!userId && (
        <Typography level='body-xs' sx={{ color: 'text.tertiary', mt: 1 }}>
          {t('adjust.pickMember')}
        </Typography>
      )}
    </Sheet>
  )
}

// Ready-made bonuses and penalties, so a parent gives them in one touch.
export const PresetsCard = ({ presets }) => {
  const { t } = useTranslation('games')
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState({})

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['pointsPresets'] })

  const save = async () => {
    const points = Number(editing.points)
    if (!editing.name.trim() || !Number.isInteger(points) || points === 0) {
      return
    }
    const resp = await SavePointsPreset({
      id: editing.id,
      name: editing.name.trim(),
      points,
    })
    if (!resp.ok) {
      showNotification({ type: 'error', message: t('presets.failed') })
      return
    }
    setEditing(null)
    refresh()
  }

  const remove = preset =>
    setConfirm({
      isOpen: true,
      title: t('presets.deleteTitle'),
      message: t('presets.deleteMessage', { name: preset.name }),
      confirmText: t('presets.delete'),
      cancelText: t('presets.cancel'),
      color: 'danger',
      onClose: async confirmed => {
        setConfirm({})
        if (!confirmed) return
        await DeletePointsPreset(preset.id)
        refresh()
      },
    })

  return (
    <Sheet sx={surfaceSx}>
      <Box sx={{ alignItems: 'center', display: 'flex', mb: 1.5 }}>
        <Stack sx={{ flex: 1 }}>
          <Typography level='title-lg'>{t('presets.title')}</Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('presets.subtitle')}
          </Typography>
        </Stack>
        <Button
          size='sm'
          variant='soft'
          startDecorator={<AddRounded />}
          onClick={() => setEditing({ name: '', points: '' })}
        >
          {t('presets.add')}
        </Button>
      </Box>

      {editing && (
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mb: 1.5 }}>
          <Input
            size='sm'
            autoFocus
            placeholder={t('presets.name')}
            value={editing.name}
            onChange={event =>
              setEditing({ ...editing, name: event.target.value })
            }
            slotProps={{ input: { maxLength: 60 } }}
            sx={{ flex: 1 }}
          />
          <Input
            size='sm'
            type='number'
            placeholder={t('presets.points')}
            value={editing.points}
            onChange={event =>
              setEditing({ ...editing, points: event.target.value })
            }
            slotProps={{
              input: { min: -MAX_POINTS, max: MAX_POINTS, step: 1 },
            }}
            sx={{ width: { sm: 130 } }}
          />
          <Button size='sm' onClick={save}>
            {t('presets.save')}
          </Button>
          <Button size='sm' variant='plain' onClick={() => setEditing(null)}>
            {t('presets.cancel')}
          </Button>
        </Stack>
      )}
      {editing && (
        <Typography level='body-xs' sx={{ color: 'text.tertiary', mb: 1.5 }}>
          {t('presets.pointsHelp')}
        </Typography>
      )}

      {presets.length === 0 && !editing && (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('presets.empty')}
        </Typography>
      )}
      <Stack gap={0.5}>
        {presets.map(preset => (
          <Box
            key={preset.id}
            sx={{ alignItems: 'center', display: 'flex', gap: 1 }}
          >
            <Chip
              size='sm'
              variant='soft'
              color={preset.points > 0 ? 'success' : 'danger'}
              sx={{ minWidth: 52, justifyContent: 'center' }}
            >
              {signed(preset.points)}
            </Chip>
            <Typography level='body-md' sx={{ flex: 1 }}>
              {preset.name}
            </Typography>
            <IconButton
              size='sm'
              aria-label={t('presets.edit')}
              onClick={() =>
                setEditing({
                  id: preset.id,
                  name: preset.name,
                  points: String(preset.points),
                })
              }
            >
              <EditRounded />
            </IconButton>
            <IconButton
              size='sm'
              color='danger'
              aria-label={t('presets.delete')}
              onClick={() => remove(preset)}
            >
              <DeleteOutlineRounded />
            </IconButton>
          </Box>
        ))}
      </Stack>
      {confirm.isOpen && <ConfirmationModal config={confirm} />}
    </Sheet>
  )
}

const presetShape = PropTypes.shape({
  id: PropTypes.number,
  name: PropTypes.string,
  points: PropTypes.number,
})

AdjustCard.propTypes = {
  bare: PropTypes.bool,
  initialUserId: PropTypes.number,
  members: PropTypes.arrayOf(memberShape).isRequired,
  presets: PropTypes.arrayOf(presetShape).isRequired,
}
PresetsCard.propTypes = {
  presets: PropTypes.arrayOf(presetShape).isRequired,
}
