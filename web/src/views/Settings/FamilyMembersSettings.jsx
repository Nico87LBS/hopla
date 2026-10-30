import {
  CloseRounded,
  ContentCopyRounded,
  DeleteOutlineRounded,
  GroupAddRounded,
  GroupRounded,
  IosShareRounded,
  LoginRounded,
  RefreshRounded,
} from '@mui/icons-material'
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Input,
  Option,
  Select,
  Sheet,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useLocalization } from '../../contexts/LocalizationContext'
import { useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { apiClient } from '../../utils/ApiClient'
import {
  AcceptFamilyMemberRequest,
  DeclineFamilyMemberRequest,
  DeleteFamilyMember,
  GetAllFamilyMembers,
  GetFamilyMemberRequests,
  GetUserFamily,
  JoinFamily,
  LeaveFamily,
  UpdateMemberRole,
} from '../../utils/Fetcher'
import { resolvePhotoURL } from '../../utils/Helpers'
import LoadingComponent from '../components/Loading'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import SettingsLayout from './SettingsLayout'

const sectionTitleSx = {
  fontWeight: 650,
  letterSpacing: '-0.01em',
}

const surfaceSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'xl',
}

const FamilyMembersSettings = () => {
  const { t } = useTranslation('settings')
  const { data: userProfile } = useUserProfile()
  const queryClient = useQueryClient()
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const { fmt } = useLocalization()

  const [userFamilies, setUserFamilies] = useState([])
  const [familyMemberRequests, setFamilyMemberRequests] = useState([])
  const [familyInviteCode, setFamilyInviteCode] = useState('')
  const [familyMembers, setFamilyMembers] = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [acceptingRequest, setAcceptingRequest] = useState(null)
  const [decliningRequest, setDecliningRequest] = useState(null)
  const [confirmModalConfig, setConfirmModalConfig] = useState({})

  const showConfirmation = (
    message,
    title,
    onConfirm,
    confirmText = t('common.confirm'),
    cancelText = t('common.cancel'),
    color = 'primary',
  ) => {
    setConfirmModalConfig({
      isOpen: true,
      message,
      title,
      confirmText,
      cancelText,
      color,
      onClose: isConfirmed => {
        if (isConfirmed) onConfirm()
        setConfirmModalConfig({})
      },
    })
  }

  const roleOptions = [
    {
      value: 'member',
      label: t('familySettings.roles.member'),
      description: t('familySettings.roles.memberDescription'),
    },
    {
      value: 'manager',
      label: t('familySettings.roles.manager'),
      description: t('familySettings.roles.managerDescription'),
    },
    {
      value: 'admin',
      label: t('familySettings.roles.admin'),
      description: t('familySettings.roles.adminDescription'),
    },
  ]

  const roleLabel = role =>
    roleOptions.find(option => option.value === role)?.label ?? role

  const loadMembers = async () => {
    const data = await GetAllFamilyMembers()
    setFamilyMembers(data.res || [])
  }

  const refreshMemberRequests = async () => {
    setIsRefreshing(true)
    try {
      const resp = await GetFamilyMemberRequests()
      const data = await resp.json()
      setFamilyMemberRequests(data.res || [])
      setLastRefresh(new Date())
    } catch (error) {
      showNotification({
        type: 'error',
        message: t('familySettings.refreshFailed'),
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    GetUserFamily()
      .then(resp => resp.json())
      .then(data => setUserFamilies(data.res || []))
    GetFamilyMemberRequests()
      .then(resp => resp.json())
      .then(data => {
        setFamilyMemberRequests(data.res || [])
        setLastRefresh(new Date())
      })
    GetAllFamilyMembers().then(data => setFamilyMembers(data.res || []))
  }, [])

  const isAdmin = familyMembers.some(
    member => member.userId === userProfile?.id && member.role === 'admin',
  )
  const family = userFamilies[0]
  const myMembership = familyMembers.find(
    member => member.userId === userProfile?.id,
  )
  const isPendingApproval =
    family?.userRole === 'member' && myMembership && !myMembership.isActive
  const inviteCode = family?.invite_code || ''
  const apiURL = new URL(apiClient.getApiURL(), window.location.origin)
  const inviteOrigin = `${apiURL.origin}${apiURL.pathname.replace(/\/api\/v1\/?$/, '')}`
  const inviteLink = inviteCode
    ? `${inviteOrigin.replace(/\/$/, '')}/family/join?code=${encodeURIComponent(inviteCode)}`
    : ''

  const copyInviteCode = async () => {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    showNotification({
      type: 'success',
      message: t('familySettings.codeCopied'),
    })
  }

  const shareInvite = async () => {
    const familyName = family?.name || t('familySettings.myFamily')
    try {
      if (!navigator.share) throw new Error('share unavailable')
      await navigator.share({
        title: t('familySettings.shareTitle', { name: familyName }),
        text: t('familySettings.shareText', { name: familyName }),
        url: inviteLink,
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      await navigator.clipboard.writeText(inviteLink)
      showNotification({
        type: 'success',
        message: t('familySettings.linkCopied'),
      })
    }
  }

  const acceptRequest = request => {
    showConfirmation(
      t('familySettings.acceptRequestMessage', {
        name: request.displayName,
        username: request.username,
      }),
      t('familySettings.acceptRequestTitle'),
      async () => {
        setAcceptingRequest(request.id)
        try {
          const resp = await AcceptFamilyMemberRequest(request.id)
          if (!resp.ok) return
          showNotification({
            type: 'success',
            message: t('familySettings.requestAccepted'),
          })
          queryClient.invalidateQueries({ queryKey: ['familyMembers'] })
          queryClient.invalidateQueries({ queryKey: ['familyMemberRequests'] })
          queryClient.invalidateQueries({ queryKey: ['userFamily'] })
          await Promise.all([refreshMemberRequests(), loadMembers()])
        } finally {
          setAcceptingRequest(null)
        }
      },
      t('familySettings.accept'),
      t('common.cancel'),
    )
  }

  const declineRequest = request => {
    showConfirmation(
      t('familySettings.declineRequestMessage', {
        name: request.displayName,
        username: request.username,
      }),
      t('familySettings.declineRequestTitle'),
      async () => {
        setDecliningRequest(request.id)
        try {
          const resp = await DeclineFamilyMemberRequest(request.id)
          if (!resp.ok) {
            showNotification({
              type: 'error',
              message: t('familySettings.declineRequestFailed'),
            })
            return
          }
          showNotification({
            type: 'success',
            message: t('familySettings.requestDeclined'),
          })
          setFamilyMemberRequests(requests =>
            requests.filter(item => item.id !== request.id),
          )
          queryClient.invalidateQueries({ queryKey: ['familyMemberRequests'] })
        } finally {
          setDecliningRequest(null)
        }
      },
      t('familySettings.declineRequestButton'),
      t('common.cancel'),
      'danger',
    )
  }

  const cancelJoinRequest = () => {
    showConfirmation(
      t('familySettings.cancelRequestMessage'),
      t('familySettings.cancelRequestTitle'),
      async () => {
        const resp = await LeaveFamily(family.id)
        if (resp.ok) {
          showNotification({
            type: 'success',
            message: t('familySettings.requestCancelled'),
          })
          queryClient.invalidateQueries({ queryKey: ['userFamily'] })
          setUserFamilies([])
        } else {
          showNotification({
            type: 'error',
            message: t('familySettings.cancelRequestFailed'),
          })
        }
      },
      t('familySettings.cancelRequestButton'),
      t('common.cancel'),
      'danger',
    )
  }

  const joinFamily = async () => {
    const code = familyInviteCode.trim()
    if (!code) return
    setIsJoining(true)
    try {
      const resp = await JoinFamily(code)
      showNotification({
        type: resp.ok ? 'success' : 'error',
        message: resp.ok
          ? t('familySettings.joinedPending')
          : resp.status === 409
            ? t('familySettings.alreadyMember')
            : t('familySettings.joinFailed'),
      })
      if (resp.ok) setFamilyInviteCode('')
      setTimeout(() => navigate('/'), 3000)
    } finally {
      setIsJoining(false)
    }
  }

  if (!userProfile) return <LoadingComponent />

  return (
    <SettingsLayout title={t('familySettings.title')}>
      <Box sx={{ maxWidth: 760, pb: 4 }}>
        <Typography
          level='body-md'
          textColor='text.secondary'
          sx={{ maxWidth: 640, mb: 3, mt: -1, textWrap: 'pretty' }}
        >
          {t('familySettings.description')}
        </Typography>

        <Sheet
          sx={{
            ...surfaceSx,
            overflow: 'hidden',
            p: { xs: 2, sm: 2.5 },
          }}
        >
          <Box
            sx={{
              alignItems: 'center',
              display: 'flex',
              gap: 1.5,
              mb: 2.25,
            }}
          >
            <Box
              sx={{
                bgcolor: 'primary.softBg',
                borderRadius: '50%',
                color: 'primary.plainColor',
                display: 'grid',
                flex: '0 0 auto',
                height: 44,
                placeItems: 'center',
                width: 44,
              }}
            >
              <GroupRounded />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography level='title-lg' sx={sectionTitleSx} noWrap>
                {family?.name || t('familySettings.myFamily')}
              </Typography>
              <Typography level='body-sm' textColor='text.secondary'>
                {isPendingApproval
                  ? t('familySettings.pendingApprovalMessage', {
                      name: family?.name,
                    })
                  : family?.userRole === 'member'
                    ? t('familySettings.memberOf', { name: family?.name })
                    : t('familySettings.yourFamilyCode')}
              </Typography>
            </Box>
          </Box>

          {isPendingApproval ? (
            <Button
              color='danger'
              variant='soft'
              startDecorator={<CloseRounded />}
              onClick={cancelJoinRequest}
            >
              {t('familySettings.cancelRequest')}
            </Button>
          ) : (
            <Box
              sx={{
                alignItems: { xs: 'stretch', sm: 'center' },
                bgcolor: 'background.level1',
                borderRadius: 'lg',
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1.5,
                justifyContent: 'space-between',
                p: 1.5,
              }}
            >
              <Typography
                sx={{
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 'clamp(1.25rem, 5vw, 1.5rem)',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                }}
              >
                {inviteCode}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant='soft'
                  disabled={!inviteCode}
                  startDecorator={<ContentCopyRounded />}
                  onClick={copyInviteCode}
                  sx={{ flex: { xs: 1, sm: 'none' } }}
                >
                  {t('familySettings.copyCode')}
                </Button>
                <Button
                  variant='solid'
                  disabled={!inviteLink}
                  startDecorator={<IosShareRounded />}
                  onClick={shareInvite}
                  sx={{ flex: { xs: 1, sm: 'none' } }}
                >
                  {t('familySettings.shareInvite')}
                </Button>
              </Box>
            </Box>
          )}
        </Sheet>

        {isAdmin && (
          <Box component='section' sx={{ mt: 3.5 }}>
            <Box
              sx={{
                alignItems: { xs: 'flex-start', sm: 'center' },
                display: 'flex',
                gap: 1,
                justifyContent: 'space-between',
                mb: 1.25,
              }}
            >
              <Box>
                <Typography level='title-md' sx={sectionTitleSx}>
                  {t('familySettings.familyMemberRequests')}
                  <Chip size='sm' variant='soft' sx={{ ml: 1 }}>
                    {familyMemberRequests.length}
                  </Chip>
                </Typography>
                {lastRefresh && (
                  <Typography level='body-xs' textColor='text.tertiary'>
                    {t('familySettings.lastUpdated', {
                      time: fmt.dateTime(lastRefresh),
                    })}
                  </Typography>
                )}
              </Box>
              <IconButton
                size='sm'
                variant='plain'
                color='neutral'
                onClick={refreshMemberRequests}
                disabled={isRefreshing}
                aria-label={t('common.refresh')}
              >
                {isRefreshing ? (
                  <CircularProgress size='sm' />
                ) : (
                  <RefreshRounded />
                )}
              </IconButton>
            </Box>

            {familyMemberRequests.length > 0 && (
              <Sheet sx={{ ...surfaceSx, overflow: 'hidden' }}>
                {familyMemberRequests.map((request, index) => (
                  <Box key={request.id}>
                    {index > 0 && <Divider />}
                    <Box
                      sx={{
                        alignItems: 'center',
                        display: 'flex',
                        gap: 1.5,
                        p: 1.5,
                      }}
                    >
                      <Avatar size='sm'>
                        {request.displayName?.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level='title-sm' noWrap>
                          {request.displayName}
                        </Typography>
                        <Typography level='body-xs' textColor='text.secondary'>
                          {t('familySettings.wantsToJoin', {
                            name: request.displayName,
                          })}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.75 }}>
                        <Button
                          size='sm'
                          color='success'
                          variant='soft'
                          loading={acceptingRequest === request.id}
                          onClick={() => acceptRequest(request)}
                        >
                          {t('familySettings.accept')}
                        </Button>
                        <Button
                          size='sm'
                          color='danger'
                          variant='soft'
                          loading={decliningRequest === request.id}
                          onClick={() => declineRequest(request)}
                        >
                          {t('familySettings.decline')}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Sheet>
            )}
          </Box>
        )}

        <Box component='section' sx={{ mt: 3.5 }}>
          <Typography level='title-md' sx={{ ...sectionTitleSx, mb: 1.25 }}>
            {t('familySettings.familyMembers')}
            <Chip size='sm' variant='soft' sx={{ ml: 1 }}>
              {familyMembers.length}
            </Chip>
          </Typography>
          <Sheet sx={{ ...surfaceSx, overflow: 'hidden' }}>
            {familyMembers.map((member, index) => {
              const isCurrentUser = member.userId === userProfile.id
              return (
                <Box key={member.id || member.userId}>
                  {index > 0 && <Divider />}
                  <Box
                    sx={{
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      display: 'flex',
                      flexWrap: { xs: 'wrap', sm: 'nowrap' },
                      gap: 1.5,
                      p: 1.5,
                    }}
                  >
                    <Avatar
                      size='sm'
                      src={resolvePhotoURL(member.image)}
                      sx={{ bgcolor: 'background.level2' }}
                    >
                      {member.displayName?.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 150 }}>
                      <Box
                        sx={{
                          alignItems: 'center',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.75,
                        }}
                      >
                        <Typography level='title-sm'>
                          {member.displayName}
                          {isCurrentUser ? ` ${t('familySettings.you')}` : ''}
                        </Typography>
                        <Chip
                          size='sm'
                          variant='soft'
                          color={member.isActive ? 'neutral' : 'warning'}
                        >
                          {member.isActive
                            ? roleLabel(member.role)
                            : t('familySettings.pendingApproval')}
                        </Chip>
                      </Box>
                      <Typography
                        level='body-xs'
                        textColor={
                          member.isActive
                            ? 'text.tertiary'
                            : 'danger.plainColor'
                        }
                      >
                        {member.isActive
                          ? t('familySettings.joinedOn', {
                              date: fmt.date(member.createdAt),
                            })
                          : t('familySettings.requestedToJoin', {
                              date: fmt.date(member.updatedAt),
                            })}
                      </Typography>
                    </Box>

                    {!isCurrentUser && isAdmin && (
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 0.75,
                          ml: { xs: 5.5, sm: 0 },
                          width: { xs: 'calc(100% - 44px)', sm: 'auto' },
                        }}
                      >
                        <Select
                          size='sm'
                          value={member.role}
                          disabled={!member.isActive}
                          aria-label={roleLabel(member.role)}
                          renderValue={() => roleLabel(member.role)}
                          onChange={(event, value) => {
                            if (!value) return
                            UpdateMemberRole(member.userId, value).then(
                              resp => {
                                if (resp.ok) {
                                  setFamilyMembers(members =>
                                    members.map(item =>
                                      item.userId === member.userId
                                        ? { ...item, role: value }
                                        : item,
                                    ),
                                  )
                                } else {
                                  showNotification({
                                    type: 'error',
                                    message: t(
                                      'familySettings.roleUpdateFailed',
                                    ),
                                  })
                                }
                              },
                            )
                          }}
                          sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 120 }}
                        >
                          {roleOptions.map(option => (
                            <Option value={option.value} key={option.value}>
                              <Box>
                                <Typography level='title-sm'>
                                  {option.label}
                                </Typography>
                                <Typography
                                  level='body-xs'
                                  textColor='text.secondary'
                                >
                                  {option.description}
                                </Typography>
                              </Box>
                            </Option>
                          ))}
                        </Select>
                        {member.isActive && (
                          <IconButton
                            variant='plain'
                            color='danger'
                            size='sm'
                            aria-label={t('common.remove')}
                            onClick={() => {
                              showConfirmation(
                                t('familySettings.removeMemberMessage', {
                                  name: member.displayName,
                                }),
                                t('familySettings.removeMemberTitle'),
                                async () => {
                                  const resp = await DeleteFamilyMember(
                                    member.familyId,
                                    member.userId,
                                  )
                                  if (!resp.ok) return
                                  showNotification({
                                    type: 'success',
                                    message: t('familySettings.memberRemoved'),
                                  })
                                  queryClient.invalidateQueries({
                                    queryKey: ['familyMembers'],
                                  })
                                  queryClient.invalidateQueries({
                                    queryKey: ['userFamily'],
                                  })
                                  setFamilyMembers(members =>
                                    members.filter(
                                      item => item.userId !== member.userId,
                                    ),
                                  )
                                },
                                t('common.remove'),
                                t('common.cancel'),
                                'danger',
                              )
                            }}
                          >
                            <DeleteOutlineRounded />
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>
              )
            })}
          </Sheet>
        </Box>

        <Box component='section' sx={{ mt: 3.5 }}>
          <Sheet
            variant='soft'
            sx={{ borderRadius: 'xl', p: { xs: 2, sm: 2.5 } }}
          >
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <GroupAddRounded
                color='primary'
                sx={{ display: { xs: 'none', sm: 'block' }, mt: 0.25 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography level='title-md' sx={sectionTitleSx}>
                  {t('familySettings.enterFamilyCode')}
                </Typography>
                <Typography
                  level='body-sm'
                  textColor='text.secondary'
                  sx={{ mb: 1.5, mt: 0.25 }}
                >
                  {t('familySettings.joinOtherDescription')}
                </Typography>
                <Box
                  sx={{
                    alignItems: 'stretch',
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1,
                  }}
                >
                  <Input
                    placeholder={t('familySettings.enterCodePlaceholder')}
                    value={familyInviteCode}
                    onChange={event => setFamilyInviteCode(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') joinFamily()
                    }}
                    startDecorator={<LoginRounded />}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    loading={isJoining}
                    disabled={!familyInviteCode.trim()}
                    onClick={joinFamily}
                  >
                    {t('familySettings.joinFamily')}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Sheet>
        </Box>

        {family && family.userRole === 'member' && !isPendingApproval && (
          <Box
            sx={{
              mt: 3.5,
              pt: 2.5,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Button
              color='danger'
              variant='plain'
              onClick={() => {
                showConfirmation(
                  t('familySettings.leaveConfirmMessage'),
                  t('familySettings.leaveConfirmTitle'),
                  async () => {
                    const resp = await LeaveFamily(family.id)
                    if (resp.ok) {
                      showNotification({
                        type: 'success',
                        message: t('familySettings.leftFamily'),
                      })
                      queryClient.invalidateQueries({
                        queryKey: ['userFamily'],
                      })
                      navigate('/')
                    } else {
                      showNotification({
                        type: 'error',
                        message: t('familySettings.leaveFailed'),
                      })
                    }
                  },
                  t('familySettings.leaveConfirmButton'),
                  t('common.cancel'),
                  'danger',
                )
              }}
            >
              {t('familySettings.leave')}
            </Button>
          </Box>
        )}
      </Box>

      {confirmModalConfig?.isOpen && (
        <ConfirmationModal config={confirmModalConfig} />
      )}
    </SettingsLayout>
  )
}

export default FamilyMembersSettings
