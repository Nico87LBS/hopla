import { StarRounded } from '@mui/icons-material'
import { Box, Option, Select, Sheet, Typography } from '@mui/joy'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import {
  useFamilyCurrency,
  useSetFamilyCurrency,
} from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { CURRENCIES, currencyVariables } from '../../utils/currency'

// What the family earns, named the same everywhere: hops, stars, carrots…
const CurrencyCard = () => {
  const { t } = useTranslation('settings')
  const { data } = useFamilyCurrency()
  const setCurrency = useSetFamilyCurrency()
  const { showError } = useNotification()

  if (!data) return null
  const change = currency => {
    if (!currency || currency === data.currency) return
    setCurrency.mutate(currency, {
      onError: () => showError({ title: t('circleSettings.currency.failed') }),
    })
  }

  return (
    <Sheet
      sx={{
        alignItems: 'center',
        bgcolor: 'background.surface',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'xl',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        p: { xs: 2, sm: 2.5 },
      }}
    >
      <Box
        sx={{
          bgcolor: HOPLA.goldSoft,
          borderRadius: '50%',
          color: HOPLA.gold,
          display: 'grid',
          flex: '0 0 auto',
          height: 44,
          placeItems: 'center',
          width: 44,
        }}
      >
        <StarRounded />
      </Box>
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Typography
          component='label'
          htmlFor='family-currency'
          level='title-lg'
          sx={{ fontWeight: 650 }}
        >
          {t('circleSettings.currency.title')}
        </Typography>
        <Typography level='body-sm' textColor='text.secondary'>
          {t('circleSettings.currency.help')}
        </Typography>
      </Box>
      <Select
        disabled={setCurrency.isPending}
        onChange={(_, value) => change(value)}
        slotProps={{ button: { id: 'family-currency' } }}
        sx={{ minWidth: 150 }}
        value={data.currency}
      >
        {CURRENCIES.map(name => (
          <Option key={name} value={name}>
            {currencyVariables(name).Units}
          </Option>
        ))}
      </Select>
    </Sheet>
  )
}

export default CurrencyCard
