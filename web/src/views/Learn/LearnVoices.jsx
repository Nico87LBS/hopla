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

import {
  canSpeak,
  chooseVoice,
  chosenVoice,
  deviceVoices,
  pickVoice,
  quality,
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

// LangVoice chooses, on this device, the voice of one language: automatic
// takes the most natural one installed.
const LangVoice = ({ lang, voices }) => {
  const { t } = useTranslation('learn')
  const [chosen, setChosen] = useState(() => chosenVoice(lang))
  const matching = voicesFor(voices, lang)
  const best = matching[0]
  const current = pickVoice(voices, lang, chosen)
  // A voice chosen then removed from the device is automatic again.
  const value = matching.some(v => v.voiceURI === chosen) ? chosen : ''
  const change = voiceURI => {
    chooseVoice(lang, voiceURI)
    setChosen(voiceURI)
    speak(t(`voices.sample.${lang}`), lang, { voiceURI })
  }
  return (
    <Box>
      <Typography level='title-sm'>{t(`voices.lang.${lang}`)}</Typography>
      {matching.length === 0 ? (
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          {t('voices.noVoice')}
        </Typography>
      ) : (
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
                  {value ? current.name : t('voices.auto', { name: best.name })}
                </Typography>
                {current && <QualityChip voice={current} />}
              </Stack>
            )}
          >
            <Option value=''>
              {t('voices.auto', { name: voiceName(best) })}
            </Option>
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
      )}
    </Box>
  )
}

LangVoice.propTypes = {
  lang: PropTypes.string.isRequired,
  voices: PropTypes.array.isRequired,
}

const HELP = ['ipad', 'mac', 'android', 'windows']

// VoicesCard: the voices of this device for the questions read aloud, and
// how to get a more natural one.
export const VoicesCard = () => {
  const { t } = useTranslation('learn')
  const [voices, setVoices] = useState([])
  useEffect(() => deviceVoices(setVoices), [])
  return (
    <>
      <Sheet sx={surfaceSx}>
        <Typography level='title-md'>{t('voices.title')}</Typography>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
          {t('voices.help')}
        </Typography>
        {canSpeak() ? (
          <Stack spacing={2} sx={{ mt: 2 }}>
            {LANGS.map(lang => (
              <LangVoice key={lang} lang={lang} voices={voices} />
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
