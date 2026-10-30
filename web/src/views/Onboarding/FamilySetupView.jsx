import {
  ContentCopyRounded,
  GroupAddRounded,
  LinkRounded,
} from '@mui/icons-material'
import { Box, Button, IconButton, Input, Link, Typography } from '@mui/joy'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import useAcknowledgmentModal from '../../hooks/useAcknowledgmentModal'
import { useNotification } from '../../service/NotificationProvider'
import { GetUserFamily, JoinFamily } from '../../utils/Fetcher'
import { hapticLight } from '../../utils/Haptics'
import { clearPendingInvite, getPendingInvite } from '../../utils/PendingInvite'
import { authButtonSx } from '../Authorization/authStyles'
import AcknowledgmentModal from '../Modals/Inputs/AcknowledgmentModal'
import { FamilyVignette } from './FamilyVignette'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const enter = (delay = 0) => ({
  animation: `familySetupIn 520ms ${EASE} ${delay}ms both`,
  '@keyframes familySetupIn': {
    from: { opacity: 0, transform: 'translateY(12px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

/**
 * A halo'd icon standing in for the vignette on the join path — that side has
 * no living preview to show (there's nothing to illustrate about someone
 * else's family yet), so it borrows the same glow treatment WorkspaceReadyView
 * puts behind its logo instead of inventing a third visual language.
 */
const IconHalo = ({ icon }) => (
  <Box
    sx={{
      position: 'relative',
      display: 'grid',
      placeItems: 'center',
      width: 84,
      height: 84,
      '&::before': {
        content: '""',
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: '50%',
        bgcolor: 'primary.softBg',
        opacity: 0.6,
        filter: 'blur(28px)',
      },
      '& > *': { position: 'relative' },
    }}
  >
    <Box
      sx={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.surface',
        border: '1px solid',
        borderColor: 'divider',
        color: 'primary.plainColor',
        '& svg': { fontSize: '2rem' },
      }}
    >
      {icon}
    </Box>
  </Box>
)

/**
 * Right after the account (and its solo Family) is created: the moment to
 * either bring the household in or hop into one that already exists. Skipping
 * via Continue is always valid — chores work fine solo, this is an offer, not
 * a gate.
 */
const FamilySetupView = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const { ackModalConfig, showAcknowledgment } = useAcknowledgmentModal()
  const pendingInvite = getPendingInvite()

  const [mode, setMode] = useState(pendingInvite ? 'join' : 'invite')
  const [inviteCode, setInviteCode] = useState(null)
  const [joinCode, setJoinCode] = useState(pendingInvite ?? '')
  const [isJoining, setIsJoining] = useState(false)

  useEffect(() => {
    GetUserFamily()
      .then(resp => resp.json())
      .then(data => setInviteCode(data.res?.[0]?.invite_code ?? null))
      .catch(() => setInviteCode(null))
  }, [])

  const finish = () => navigate('/', { replace: true })

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode)
    showNotification({
      type: 'success',
      message: t('familySetup.codeCopied'),
    })
  }

  const copyLink = () => {
    navigator.clipboard.writeText(
      `${window.location.protocol}//${window.location.host}/family/join?code=${inviteCode}`,
    )
    showNotification({
      type: 'success',
      message: t('familySetup.linkCopied'),
    })
  }

  const joinFamily = async () => {
    if (!joinCode.trim()) return
    setIsJoining(true)
    hapticLight()
    try {
      const resp = await JoinFamily(joinCode.trim())
      if (resp.ok) {
        clearPendingInvite()
        showAcknowledgment(
          t('familySetup.requestSentBody'),
          t('familySetup.requestSentTitle'),
          finish,
        )
      } else {
        showNotification({
          type: 'error',
          message:
            resp.status === 409
              ? t('familySetup.alreadyMember')
              : t('familySetup.joinFailed'),
        })
      }
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <Box
      component='main'
      sx={{
        minHeight: 'calc(100dvh - var(--safe-area-inset-top, 0px))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        px: 3,
        pb: 3,
        bgcolor: 'background.body',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 420,
          my: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ mb: 2, ...enter(0) }}>
          {mode === 'invite' ? (
            <FamilyVignette />
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <IconHalo icon={<GroupAddRounded />} />
            </Box>
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 1.5,
            mb: 4,
            ...enter(60),
          }}
        >
          <Typography
            level='h1'
            sx={{
              fontSize: '2rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              textWrap: 'balance',
            }}
          >
            {mode === 'invite'
              ? t('familySetup.inviteTitle')
              : t('familySetup.joinTitle')}
          </Typography>
          <Typography
            level='body-md'
            sx={{
              color: 'text.secondary',
              maxWidth: '32ch',
              textWrap: 'pretty',
            }}
          >
            {mode === 'invite'
              ? t('familySetup.inviteSubtitle')
              : t('familySetup.joinSubtitle')}
          </Typography>
        </Box>

        {mode === 'invite' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box
              sx={{
                ...enter(120),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: '16px',
                bgcolor: 'background.surface',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                sx={{
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: '1.375rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: inviteCode ? 'text.primary' : 'text.tertiary',
                }}
              >
                {inviteCode ?? t('familySetup.loadingCode')}
              </Typography>
              <IconButton
                variant='soft'
                color='primary'
                disabled={!inviteCode}
                onClick={copyCode}
                aria-label={t('familySetup.copyCodeAria')}
              >
                <ContentCopyRounded />
              </IconButton>
            </Box>

            <Box sx={{ textAlign: 'center', ...enter(150) }}>
              <Link
                component='button'
                type='button'
                level='body-sm'
                color='neutral'
                underline='hover'
                startDecorator={<LinkRounded fontSize='small' />}
                disabled={!inviteCode}
                onClick={copyLink}
              >
                {t('familySetup.copyLinkInstead')}
              </Link>
            </Box>

            <Box sx={{ mt: 1, ...enter(190) }}>
              <Button size='lg' fullWidth onClick={finish} sx={authButtonSx}>
                {t('familySetup.continue')}
              </Button>
            </Box>

            <Box sx={{ textAlign: 'center', ...enter(230) }}>
              <Link
                component='button'
                type='button'
                level='body-sm'
                color='neutral'
                underline='hover'
                startDecorator={<GroupAddRounded fontSize='small' />}
                onClick={() => setMode('join')}
              >
                {t('familySetup.joinInstead')}
              </Link>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ ...enter(120) }}>
              <Input
                placeholder={t('familySetup.codePlaceholder')}
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                size='lg'
                fullWidth
                autoFocus
              />
            </Box>
            <Box sx={{ ...enter(160) }}>
              <Button
                size='lg'
                fullWidth
                loading={isJoining}
                disabled={!joinCode.trim()}
                onClick={joinFamily}
                sx={authButtonSx}
              >
                {t('familySetup.joinButton')}
              </Button>
            </Box>
            <Box sx={{ textAlign: 'center', ...enter(200) }}>
              <Link
                component='button'
                type='button'
                level='body-sm'
                color='neutral'
                underline='hover'
                onClick={() => {
                  clearPendingInvite()
                  setJoinCode('')
                  setMode('invite')
                }}
              >
                {t('familySetup.back')}
              </Link>
            </Box>
          </Box>
        )}
      </Box>

      <AcknowledgmentModal config={ackModalConfig} />
    </Box>
  )
}

export default FamilySetupView
