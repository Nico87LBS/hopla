import { Avatar, Box, Button, Link, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import Cookies from 'js-cookie'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth.jsx'
import { useResource } from '../../queries/ResourceQueries'
import { useUserProfile } from '../../queries/UserQueries.jsx'
import { useNotification } from '../../service/NotificationProvider'
import { apiClient } from '../../utils/ApiClient'
import { getPendingInvite } from '../../utils/PendingInvite'
import { saveTokens } from '../../utils/TokenStorage'
import { buildChildUsername, getUserDisplayInfo } from '../../utils/UserHelpers'
import {
  AuthDivider,
  AuthPasswordField,
  AuthSubmitButton,
  AuthTextField,
  SocialButton,
} from './AuthFields'
import AuthShell from './AuthShell'
import { authButtonSx } from './authStyles'
import MFAVerificationModal from './MFAVerificationModal'

const SegmentedControl = ({ onChange, options, value }) => (
  <Box
    role='tablist'
    sx={{
      display: 'flex',
      p: 0.5,
      gap: 0.5,
      borderRadius: '12px',
      bgcolor: 'neutral.softBg',
      mb: 2.5,
    }}
  >
    {options.map(option => {
      const selected = option.value === value
      return (
        <Box
          key={option.value}
          component='button'
          type='button'
          role='tab'
          aria-selected={selected}
          onClick={() => onChange(option.value)}
          sx={{
            flex: 1,
            border: 'none',
            cursor: 'pointer',
            borderRadius: '9px',
            py: 1,
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            fontWeight: 600,
            color: selected ? 'text.primary' : 'text.secondary',
            bgcolor: selected ? 'background.surface' : 'transparent',
            boxShadow: selected ? 'xs' : 'none',
            transition: 'background-color 180ms ease, color 180ms ease',
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.500',
              outlineOffset: '2px',
            },
          }}
        >
          {option.label}
        </Box>
      )
    })}
  </Box>
)

const LoginView = () => {
  const { t } = useTranslation('auth')
  // Use React Query client directly to invalidate the user profile query
  const queryClient = useQueryClient()
  const { data: userProfile } = useUserProfile()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mfaModalOpen, setMfaModalOpen] = useState(false)
  const [mfaSessionToken, setMfaSessionToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Child login state
  const [loginType, setLoginType] = useState('primary')
  const [parentUsername, setParentUsername] = useState('')
  const [childName, setChildName] = useState('')

  // Clear fields when switching login modes
  const handleLoginModeChange = newValue => {
    setLoginType(newValue)
    setUsername('')
    setParentUsername('')
    setChildName('')
    setPassword('')
  }
  const { data: resource } = useResource()
  const { showError } = useNotification()
  const { isAuthenticated, login: authLogin, user } = useAuth()
  const Navigate = useNavigate()
  useEffect(() => {
    if (isAuthenticated && user) {
      // An already-signed-in visitor who lands here from a deep link (a family
      // invite, for example) still has to end up where they were headed.
      const redirectUrl = Cookies.get('ca_redirect')
      if (redirectUrl && redirectUrl !== '/') {
        Cookies.remove('ca_redirect')
        Navigate(redirectUrl)
      } else {
        Navigate('/')
      }
    }
  }, [isAuthenticated, user, Navigate])
  const handleSubmit = async e => {
    e.preventDefault()

    // Validation for child login
    if (loginType === 'sub') {
      if (!parentUsername.trim()) {
        showError({
          title: t('validationError'),
          message: t('primaryUsernameRequired'),
        })
        return
      }
      if (!childName.trim()) {
        showError({
          title: t('validationError'),
          message: t('subNameRequired'),
        })
        return
      }
    } else {
      if (!username.trim()) {
        showError({
          title: t('validationError'),
          message: t('usernameRequired'),
        })
        return
      }
    }

    if (!password) {
      showError({
        title: t('validationError'),
        message: t('passwordRequired'),
      })
      return
    }

    // Determine the actual username to send
    const actualUsername =
      loginType === 'sub'
        ? buildChildUsername(parentUsername, childName)
        : username

    setIsSubmitting(true)
    let result
    try {
      result = await authLogin({ username: actualUsername, password })
    } catch (error) {
      showError({
        title: t('loginFailed'),
        message: error?.message || t('genericError'),
      })
      return
    } finally {
      setIsSubmitting(false)
    }

    if (result.success) {
      if (result.data?.mfaRequired) {
        setMfaSessionToken(result.data.sessionToken)
        setMfaModalOpen(true)
        return
      }

      // Refetch user profile after successful login
      queryClient.refetchQueries({ queryKey: ['userProfile'] })

      const redirectUrl = Cookies.get('ca_redirect')
      if (redirectUrl && redirectUrl !== '/') {
        Cookies.remove('ca_redirect')
        Navigate(redirectUrl)
      } else {
        Navigate('/')
      }
    } else {
      showError({
        title: t('loginFailed'),
        message: result.error || t('genericError'),
      })
    }
  }

  const getUserProfileAndNavigateToHome = () => {
    // Refetch user profile after login using React Query
    queryClient.invalidateQueries({ queryKey: ['userProfile'] }).then(() => {
      // check if redirect url is set in cookie:
      const redirectUrl = Cookies.get('ca_redirect')
      if (redirectUrl) {
        Cookies.remove('ca_redirect')
        Navigate(redirectUrl)
      } else {
        Navigate('/')
      }
    })
  }

  const handleMFASuccess = async data => {
    // Save all tokens including refresh tokens
    await saveTokens({
      accessToken: data.token,
      accessTokenExpiry: data.expire,
      refreshTokenExpiry: data.refresh_token_expiry,
    })

    setMfaModalOpen(false)
    setMfaSessionToken('')

    // Refetch user profile after MFA success
    queryClient.invalidateQueries({ queryKey: ['userProfile'] })

    const redirectUrl = Cookies.get('ca_redirect')
    if (redirectUrl) {
      Cookies.remove('ca_redirect')
      Navigate(redirectUrl)
    } else {
      Navigate('/')
    }
  }

  const handleMFAError = errorMessage => {
    showError({
      title: t('mfaFailed'),
      message: errorMessage,
    })
  }

  const handleMFAClose = () => {
    setMfaModalOpen(false)
    setMfaSessionToken('')
  }

  const handleForgotPassword = () => {
    Navigate('/forgot-password')
  }
  // Unpadded base64url (RFC 4648 §5), as required by RFC 7636 for PKCE
  const toBase64Url = bytes =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  const generateRandomString = entropyLen => {
    const data = new Uint8Array(entropyLen)
    crypto.getRandomValues(data)
    return toBase64Url(data)
  }

  const handleAuthentikLogin = async () => {
    const authentikAuthorizeUrl = resource?.identity_provider?.auth_url
    const state = generateRandomString(16)
    localStorage.setItem('authState', state)

    const scopes = resource?.identity_provider?.scopes ?? [
      'openid',
      'profile',
      'email',
    ]

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: resource?.identity_provider?.client_id,
      scope: scopes.join(' '),
      state: state,
    })

    if (resource?.identity_provider?.pkce) {
      const verifier = generateRandomString(32)
      localStorage.setItem('authVerifier', verifier)

      const challengeDigest = new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(verifier),
        ),
      )
      const challenge = toBase64Url(challengeDigest)

      params.set('code_challenge', challenge)
      params.set('code_challenge_method', 'S256')
    } else {
      localStorage.removeItem('authVerifier')
    }

    // For web platforms, use the current approach
    params.set('redirect_uri', `${window.location.origin}/auth/oauth2`)
    window.location.href = `${authentikAuthorizeUrl}?${params.toString()}`
  }

  const displayName = userProfile?.displayName || userProfile?.username
  const hasSocialOptions = Boolean(resource?.identity_provider?.client_id)

  return (
    <AuthShell
      title={userProfile ? t('welcomeBack') : t('signIn')}
      subtitle={
        getPendingInvite()
          ? t('pendingInviteSubtitle')
          : userProfile
            ? t('pickUpWhereLeftOff')
            : t('signInToContinueSubtitle')
      }
      logoSize={0}
    >
      {userProfile ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Avatar
            src={userProfile?.image}
            alt={displayName}
            sx={{ width: 88, height: 88 }}
          />
          <Box sx={{ textAlign: 'center' }}>
            <Typography level='title-md'>{displayName}</Typography>
            {getUserDisplayInfo(userProfile).userType === 'child' && (
              <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                {t('subAccount')}
              </Typography>
            )}
          </Box>

          <Button
            fullWidth
            size='lg'
            sx={{ ...authButtonSx, mt: 1 }}
            onClick={getUserProfileAndNavigateToHome}
          >
            {t('continueAs', { name: displayName })}
          </Button>
          <Button
            fullWidth
            size='lg'
            variant='plain'
            color='neutral'
            sx={authButtonSx}
            onClick={() => apiClient.handleLogout()}
          >
            {t('useDifferentAccount')}
          </Button>
        </Box>
      ) : (
        <Box
          component='form'
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column' }}
        >
          <SegmentedControl
            value={loginType}
            onChange={handleLoginModeChange}
            options={[
              { value: 'primary', label: t('primaryAccount') },
              { value: 'sub', label: t('subAccount') },
            ]}
          />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loginType === 'primary' ? (
              <AuthTextField
                label={t('username')}
                id='username'
                name='username'
                autoComplete='username'
                placeholder={t('yourUsername')}
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            ) : (
              <>
                <AuthTextField
                  label={t('primaryAccountUsernameLabel')}
                  id='parentUsername'
                  name='parentUsername'
                  autoComplete='username'
                  placeholder={t('primaryUsernamePlaceholder')}
                  autoFocus
                  value={parentUsername}
                  onChange={e => setParentUsername(e.target.value)}
                />
                <AuthTextField
                  label={t('subAccountNameLabel')}
                  id='childName'
                  name='childName'
                  placeholder={t('subNamePlaceholder')}
                  value={childName}
                  onChange={e => setChildName(e.target.value)}
                />
              </>
            )}

            <Box>
              <AuthPasswordField
                id='password'
                name='password'
                autoComplete='current-password'
                label={t('passwordLabel')}
                placeholder={t('loginPasswordPlaceholder')}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Link
                  component='button'
                  type='button'
                  level='body-sm'
                  underline='hover'
                  onClick={handleForgotPassword}
                >
                  {t('forgotPassword')}
                </Link>
              </Box>
            </Box>
          </Box>

          <AuthSubmitButton loading={isSubmitting} sx={{ mt: 3 }}>
            {loginType === 'sub' ? t('signInAsSubAccount') : t('signIn')}
          </AuthSubmitButton>
        </Box>
      )}

      {hasSocialOptions && <AuthDivider>{t('orContinueWith')}</AuthDivider>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {resource?.identity_provider?.client_id && (
          <SocialButton onClick={handleAuthentikLogin}>
            {resource?.identity_provider?.name}
          </SocialButton>
        )}
      </Box>

      {!userProfile && !resource?.is_user_creation_disabled && (
        <Typography
          level='body-sm'
          sx={{ mt: 3, textAlign: 'center', color: 'text.secondary' }}
        >
          {t('dontHaveAccount')}{' '}
          <Link
            component='button'
            type='button'
            level='body-sm'
            fontWeight={600}
            underline='hover'
            onClick={() => Navigate('/signup')}
          >
            {t('createOne')}
          </Link>
        </Typography>
      )}

      <MFAVerificationModal
        open={mfaModalOpen}
        onClose={handleMFAClose}
        sessionToken={mfaSessionToken}
        onSuccess={handleMFASuccess}
        onError={handleMFAError}
      />
    </AuthShell>
  )
}

export default LoginView
