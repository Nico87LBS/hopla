import { SchoolRounded } from '@mui/icons-material'
import { Container, Sheet, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { setFamilyCurrency } from '../../utils/currency'
import { playSession, startPlay } from '../../utils/learn/playSession'
import LoadingComponent from '../components/Loading'
import { LearnModules } from './LearnHome'
import LearnPlay from './LearnPlay'

// The play pages open a child's games on the family screen, signed in as
// nobody: /play/<code> trades a short link for a session that can only play,
// then /play lists the child's modules and /play/<user>/<module> plays one.

const Closed = ({ text }) => {
  const { t } = useTranslation('learn')
  return (
    <Container maxWidth='sm' sx={{ px: 2, py: 6 }}>
      <Sheet
        variant='outlined'
        sx={{ borderRadius: 'xl', p: 3, textAlign: 'center' }}
      >
        <SchoolRounded sx={{ fontSize: 40, color: HOPLA.violet }} />
        <Typography level='title-md' sx={{ mt: 1 }}>
          {t('playLink.expiredTitle')}
        </Typography>
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          {text}
        </Typography>
      </Sheet>
    </Container>
  )
}

Closed.propTypes = { text: PropTypes.string.isRequired }

// /play/:code: the link is good once, so it is traded only once even when
// React runs the effect twice.
export const PlayStart = () => {
  const { t } = useTranslation('learn')
  const { code } = useParams()
  const navigate = useNavigate()
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    startPlay(code)
      .then(session => {
        setFamilyCurrency(session.currency)
        navigate('/play', { replace: true })
      })
      .catch(() => setFailed(true))
  }, [code, navigate])

  if (failed) return <Closed text={t('playLink.expired')} />
  return <LoadingComponent />
}

// usePlaySession is the session of this tab, with the family's currency.
const usePlaySession = () => {
  const session = playSession()
  useEffect(() => {
    if (session) setFamilyCurrency(session.currency)
  }, [session?.currency]) // eslint-disable-line react-hooks/exhaustive-deps
  return session
}

// /play: the modules of the child the link was made for.
export const PlayHome = () => {
  const { t } = useTranslation('learn')
  const session = usePlaySession()
  if (!session) return <Closed text={t('playLink.ended')} />
  const { member } = session
  return (
    <LearnModules
      userId={member.userId}
      member={member}
      isParent={false}
      playPath={moduleId => `/play/${member.userId}/${moduleId}`}
    />
  )
}

// /play/:userId/:moduleId: one game.
export const PlayGame = () => {
  const { t } = useTranslation('learn')
  const session = usePlaySession()
  if (!session) return <Closed text={t('playLink.ended')} />
  return <LearnPlay playMode />
}
