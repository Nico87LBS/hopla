import { VolumeUpRounded } from '@mui/icons-material'
import {
  Box,
  Chip,
  IconButton,
  Option,
  Select,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { loadServerVoices } from '../../utils/learn/serverVoice'
import {
  canSpeak,
  chooseVoice,
  chosenVoice,
  deviceVoices,
  pickVoice,
  quality,
  SERVER,
  serverVoiceFor,
  serverVoicesFor,
  speak,
  voicesFor,
} from '../../utils/learn/speech'
import { surfaceSx } from '../Games/GameParts'

// The languages the modules are read in.
const LANGS = ['fr', 'en']

const QUALITY = ['novelty', 'standard', 'enhanced', 'premium']

const QualityChip = ({ voice }) => {
  const { t } = useTranslation('learn')
  const level = quality(voice)
  return (
    <Chip
      size='sm'
      variant='soft'
      color={level >= 2 ? 'success' : 'neutral'}
      sx={{ flexShrink: 0 }}
    >
      {t(`voices.quality.${QUALITY[level]}`)}
    </Chip>
  )
}

QualityChip.propTypes = { voice: PropTypes.object.isRequired }

const voiceName = voice => `${voice.name} (${voice.lang})`

// A voice of the server is named by its speaker: fr_FR-siwis-medium is
// « Siwis ».
export const serverName = name => {
  const speaker = (name.split('-')[1] || name).replace(/_/g, ' ')
  return speaker.charAt(0).toUpperCase() + speaker.slice(1)
}

const ServerChip = () => {
  const { t } = useTranslation('learn')
  return (
    <Chip size='sm' variant='soft' color='success' sx={{ flexShrink: 0 }}>
      {t('voices.server')}
    </Chip>
  )
}

// LangVoice chooses, on this device, the voice of one language: automatic
// takes the server's voice when there is one, else the most natural one
// installed.
const LangVoice = ({ lang, server, voices }) => {
  const { t } = useTranslation('learn')
  const [chosen, setChosen] = useState(() => chosenVoice(lang))
  const matching = voicesFor(voices, lang)
  const fromServer = serverVoicesFor(lang, server)
  const best = matching[0]
  const autoServer = serverVoiceFor(lang, '', server)
  const autoName = autoServer ? serverName(autoServer) : best?.name
  const current = pickVoice(voices, lang, chosen)
  // A voice chosen then removed is automatic again.
  const known =
    matching.some(v => v.voiceURI === chosen) ||
    fromServer.some(v => SERVER + v.name === chosen)
  const value = known ? chosen : ''
  const playing = serverVoiceFor(lang, value, server)
  const change = voiceURI => {
    chooseVoice(lang, voiceURI)
    setChosen(voiceURI)
    speak(t(`voices.sample.${lang}`), lang, { voiceURI })
  }
  if (matching.length === 0 && fromServer.length === 0) {
    return (
      <Box>
        <Typography level='title-sm'>{t(`voices.lang.${lang}`)}</Typography>
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          {t('voices.noVoice')}
        </Typography>
      </Box>
    )
  }
  return (
    <Box>
      <Typography level='title-sm'>{t(`voices.lang.${lang}`)}</Typography>
      <Stack direction='row' spacing={1} sx={{ mt: 0.5 }}>
        <Select
          size='sm'
          value={value}
          onChange={(_, voiceURI) => voiceURI !== null && change(voiceURI)}
          slotProps={{
            button: { 'aria-label': t(`voices.lang.${lang}`) },
            listbox: { sx: { maxHeight: 320 } },
          }}
          sx={{ flex: 1, minWidth: 0 }}
          renderValue={() => (
            <Stack
              direction='row'
              spacing={1}
              sx={{ alignItems: 'center', minWidth: 0 }}
            >
              <Typography noWrap level='body-sm'>
                {!value
                  ? t('voices.auto', { name: autoName })
                  : playing
                    ? serverName(playing)
                    : current?.name}
              </Typography>
              {playing ? (
                <ServerChip />
              ) : (
                current && <QualityChip voice={current} />
              )}
            </Stack>
          )}
        >
          <Option value=''>{t('voices.auto', { name: autoName })}</Option>
          {fromServer.map(voice => (
            <Option key={voice.name} value={SERVER + voice.name}>
              <Typography noWrap level='body-sm' sx={{ flex: 1 }}>
                {`${serverName(voice.name)} (${voice.name})`}
              </Typography>
              <ServerChip />
            </Option>
          ))}
          {matching.map(voice => (
            <Option key={voice.voiceURI} value={voice.voiceURI}>
              <Typography noWrap level='body-sm' sx={{ flex: 1 }}>
                {voiceName(voice)}
              </Typography>
              <QualityChip voice={voice} />
            </Option>
          ))}
        </Select>
        <IconButton
          size='sm'
          variant='soft'
          aria-label={t('voices.listen')}
          onClick={() =>
            speak(t(`voices.sample.${lang}`), lang, { voiceURI: value })
          }
        >
          <VolumeUpRounded />
        </IconButton>
      </Stack>
    </Box>
  )
}

LangVoice.propTypes = {
  lang: PropTypes.string.isRequired,
  server: PropTypes.array.isRequired,
  voices: PropTypes.array.isRequired,
}

const HELP = ['ipad', 'mac', 'android', 'windows']

// VoicesCard: the voices of this device for the questions read aloud, and
// how to get a more natural one.
export const VoicesCard = () => {
  const { t } = useTranslation('learn')
  const [voices, setVoices] = useState([])
  const [server, setServerVoices] = useState([])
  useEffect(() => deviceVoices(setVoices), [])
  useEffect(() => {
    let live = true
    loadServerVoices().then(list => live && setServerVoices(list))
    return () => {
      live = false
    }
  }, [])
  return (
    <>
      <Sheet sx={surfaceSx}>
        <Typography level='title-md'>{t('voices.title')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('voices.help')}
        </Typography>
        {server.length > 0 && (
          <Typography level='body-xs' sx={{ color: 'text.secondary', mt: 0.5 }}>
            {t('voices.serverHelp')}
          </Typography>
        )}
        {canSpeak() ? (
          <Stack spacing={2} sx={{ mt: 2 }}>
            {LANGS.map(lang => (
              <LangVoice
                key={lang}
                lang={lang}
                server={server}
                voices={voices}
              />
            ))}
          </Stack>
        ) : (
          <Typography level='body-sm' sx={{ mt: 1 }}>
            {t('voices.unsupported')}
          </Typography>
        )}
      </Sheet>
      <Sheet sx={surfaceSx}>
        <Typography level='title-md'>{t('voices.getBetter')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('voices.getBetterHelp')}
        </Typography>
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {HELP.map(device => (
            <Box key={device}>
              <Typography level='title-sm'>
                {t(`voices.how.${device}.title`)}
              </Typography>
              <Typography level='body-sm'>
                {t(`voices.how.${device}.steps`)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Sheet>
    </>
  )
}

export default VoicesCard
