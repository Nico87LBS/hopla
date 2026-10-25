import {
  ChevronRightRounded,
  CloudOffRounded,
  LockRounded,
  SchoolRounded,
} from '@mui/icons-material'
import { Box, Button, Container, Sheet, Stack, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useIsParent } from '../../hooks/useIsParent'
import {
  learnKeys,
  sendWaitingGames,
  usePlayer,
} from '../../queries/LearnQueries'
import { useCircleMembers, useUserProfile } from '../../queries/UserQueries'
import { moduleLocked, openChapters, totalLeft } from '../../utils/learn/engine'
import { queuedFor } from '../../utils/learn/store'
import LoadingComponent from '../components/Loading'
import { MemberAvatar } from '../Games/GameParts'
import { Progress, subjectColor, useCompiled } from './LearnParts'

const pageSx = { px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 3 } }

const useActiveMembers = () => {
  const { data } = useCircleMembers()
  return useMemo(
    () => (data?.res || []).filter(m => m.isActive !== false),
    [data?.res],
  )
}

// /learn: a child goes to her own games, a parent picks who plays.
export const LearnChooser = () => {
  const { t } = useTranslation('learn')
  const isParent = useIsParent()
  const { data: me } = useUserProfile()
  const members = useActiveMembers()
  if (isParent === undefined || !me) return <LoadingComponent />
  if (!isParent) return <Navigate to={`/learn/${me.id}`} replace />
  return (
    <Container maxWidth='sm' sx={pageSx}>
      <Typography level='h2' sx={{ mb: 0.5 }}>
        {t('chooser.title')}
      </Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 2.5 }}>
        {t('chooser.subtitle')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        }}
      >
        {members.map(member => (
          <Sheet
            key={member.userId}
            component={Link}
            to={`/learn/${member.userId}`}
            variant='outlined'
            sx={{
              alignItems: 'center',
              borderRadius: 'xl',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 2,
              textDecoration: 'none',
              '&:hover': { borderColor: HOPLA.violet },
            }}
          >
            <MemberAvatar member={member} size={64} />
            <Typography level='title-sm'>{member.displayName}</Typography>
          </Sheet>
        ))}
      </Box>
      <Button
        component={Link}
        to='/manage/learn'
        variant='plain'
        sx={{ mt: 3 }}
        endDecorator={<ChevronRightRounded />}
      >
        {t('chooser.manage')}
      </Button>
    </Container>
  )
}

const ModuleCard = ({
  cards,
  compiled,
  compiledById,
  dayFull,
  module,
  userId,
}) => {
  const { t } = useTranslation('learn')
  const color = subjectColor(module.subject, module.document?.couleur)
  const locked = moduleLocked(compiled, compiledById, cards)
  const chapters = openChapters(
    compiled,
    cards,
    module.unlockPercent ?? undefined,
  )
  const current = [...chapters].reverse().find(c => c.open)
  // The bar is the chapter being learnt, the one that opens the next.
  const percent = current?.progress.percent ?? 0
  const capped = dayFull || module.earnedToday >= module.dailyCap

  const body = (
    <Stack direction='row' gap={1.5} alignItems='center'>
      <Box
        sx={{
          alignItems: 'center',
          bgcolor: locked ? 'background.level2' : color,
          borderRadius: '14px',
          color: locked ? 'text.tertiary' : '#fff',
          '--Icon-color': 'currentColor',
          display: 'flex',
          flexShrink: 0,
          height: 48,
          justifyContent: 'center',
          width: 48,
        }}
      >
        {locked ? <LockRounded /> : <SchoolRounded />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level='title-md' noWrap>
          {module.name}
        </Typography>
        {locked ? (
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
            {t('home.locked', {
              chapter: locked.chapter?.name || locked.module.name,
              needed: locked.needed,
              percent: locked.percent,
            })}
          </Typography>
        ) : (
          <>
            <Typography level='body-xs' sx={{ color: 'text.secondary' }} noWrap>
              {current?.chapter.name}
            </Typography>
            <Stack
              direction='row'
              gap={1}
              alignItems='center'
              sx={{ mt: 0.75 }}
            >
              <Box sx={{ flex: 1 }}>
                <Progress value={percent} color={color} />
              </Box>
              <Typography
                level='body-xs'
                sx={{ minWidth: 34, textAlign: 'right' }}
              >
                {percent} %
              </Typography>
            </Stack>
          </>
        )}
      </Box>
      {!locked && (
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography
            level='body-xs'
            sx={{
              color: capped ? 'text.tertiary' : HOPLA.goldText,
              fontWeight: 700,
            }}
          >
            {t('home.hopsToday', {
              earned: module.earnedToday,
              cap: module.dailyCap,
            })}
          </Typography>
          <ChevronRightRounded sx={{ color: 'text.tertiary' }} />
        </Box>
      )}
    </Stack>
  )

  return (
    <Sheet
      variant='outlined'
      component={locked ? 'div' : Link}
      to={locked ? undefined : `/learn/${userId}/play/${module.id}`}
      sx={{
        borderRadius: 'xl',
        display: 'block',
        opacity: locked ? 0.7 : 1,
        p: 1.5,
        textDecoration: 'none',
        '&:hover': locked ? {} : { borderColor: color },
      }}
    >
      {body}
    </Sheet>
  )
}

ModuleCard.propTypes = {
  cards: PropTypes.instanceOf(Map).isRequired,
  dayFull: PropTypes.bool,
  compiled: PropTypes.object.isRequired,
  compiledById: PropTypes.object.isRequired,
  module: PropTypes.object.isRequired,
  userId: PropTypes.number.isRequired,
}

// groupByPack puts the modules under their pack, in the pack's order; the
// others come last.
const groupByPack = player => {
  const left = new Map(player.modules.map(m => [m.id, m]))
  const groups = []
  for (const pack of player.packs) {
    const modules = (pack.children || [])
      .map(id => left.get(id))
      .filter(Boolean)
    modules.forEach(m => left.delete(m.id))
    if (modules.length) groups.push({ id: pack.id, name: pack.name, modules })
  }
  if (left.size) groups.push({ id: '', name: '', modules: [...left.values()] })
  return groups
}

// /learn/:userId: the modules a person plays.
export const LearnHome = () => {
  const { t } = useTranslation('learn')
  const { userId: param } = useParams()
  const userId = Number(param)
  const isParent = useIsParent()
  const { data: me } = useUserProfile()
  const members = useActiveMembers()
  const queryClient = useQueryClient()
  const { data: player, error, isLoading } = usePlayer(userId)
  const { byId, cards } = useCompiled(player)

  useEffect(() => {
    const online = async () => {
      await sendWaitingGames()
      queryClient.invalidateQueries({ queryKey: learnKeys.player(userId) })
    }
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [queryClient, userId])

  if (me && isParent === false && me.id !== userId) {
    return <Navigate to={`/learn/${me.id}`} replace />
  }
  if (isLoading) return <LoadingComponent />

  const member = members.find(m => m.userId === userId)
  const waiting = queuedFor(userId)
  const groups = player ? groupByPack(player) : []
  const left = totalLeft(player)

  return (
    <Container maxWidth='sm' sx={pageSx}>
      <Stack direction='row' gap={1.5} alignItems='center' sx={{ mb: 2 }}>
        {member && <MemberAvatar member={member} size={48} />}
        <Box>
          <Typography level='h3'>
            {t('home.title', { name: member?.displayName || '' })}
          </Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('home.subtitle')}
          </Typography>
        </Box>
      </Stack>

      {Number.isFinite(left) && (
        <Sheet
          variant='outlined'
          sx={{
            alignItems: 'center',
            borderRadius: 'lg',
            display: 'flex',
            gap: 1.5,
            mb: 2,
            p: 1.25,
          }}
        >
          <Typography level='title-sm' sx={{ flexShrink: 0 }}>
            {t('home.totalToday', {
              earned: player.earnedToday,
              cap: player.totalCap,
            })}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Progress
              value={
                player.totalCap
                  ? (player.earnedToday * 100) / player.totalCap
                  : 100
              }
              color={HOPLA.gold}
            />
          </Box>
          {left === 0 && (
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
              {t('home.dayFull')}
            </Typography>
          )}
        </Sheet>
      )}

      {(player?.offline || waiting > 0) && (
        <Sheet
          variant='soft'
          sx={{
            alignItems: 'center',
            bgcolor: HOPLA.goldSoft,
            borderRadius: 'lg',
            color: HOPLA.goldText,
            display: 'flex',
            gap: 1,
            mb: 2,
            p: 1.25,
          }}
        >
          <CloudOffRounded />
          <Typography level='body-sm' sx={{ color: 'inherit' }}>
            {player?.offline ? t('home.offline') : ''}{' '}
            {waiting > 0 ? t('home.waiting', { count: waiting }) : ''}
          </Typography>
        </Sheet>
      )}

      {error && !player && (
        <Typography color='danger'>{t('home.error')}</Typography>
      )}

      {player && groups.length === 0 && (
        <Sheet
          variant='outlined'
          sx={{ borderRadius: 'xl', p: 3, textAlign: 'center' }}
        >
          <SchoolRounded sx={{ fontSize: 40, color: HOPLA.violet }} />
          <Typography level='title-md' sx={{ mt: 1 }}>
            {t('home.empty')}
          </Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {isParent ? t('home.emptyParent') : t('home.emptyChild')}
          </Typography>
          {isParent && (
            <Button component={Link} to='/manage/learn' sx={{ mt: 2 }}>
              {t('chooser.manage')}
            </Button>
          )}
        </Sheet>
      )}

      <Stack gap={2.5}>
        {groups.map(group => (
          <Box component='section' key={group.id || 'others'}>
            <Typography
              level='body-xs'
              sx={{
                color: 'text.tertiary',
                fontWeight: 700,
                letterSpacing: '.06em',
                mb: 1,
                px: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {group.name || t('home.others')}
            </Typography>
            <Stack gap={1}>
              {group.modules
                .filter(module => byId[module.id])
                .map(module => (
                  <ModuleCard
                    key={module.id}
                    module={module}
                    compiled={byId[module.id]}
                    compiledById={byId}
                    cards={cards}
                    dayFull={left === 0}
                    userId={userId}
                  />
                ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Container>
  )
}
