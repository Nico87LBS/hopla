import { Box, Chip, Typography } from '@mui/joy'
import { useTranslation } from 'react-i18next'

import { useIsParent } from '../../hooks/useIsParent'
import { useRedemptions } from '../Rewards/RewardQueries'
import RewardsView from '../Rewards/RewardsView'

// The Boutique tab of Famille: spending hops. Parents see the requests
// waiting for them first. The rewards themselves are set up in Gérer.
const ShopView = () => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  const { data: pending = [] } = useRedemptions('pending')
  const showRequests = isParent && pending.length > 0

  return (
    <Box>
      {showRequests && (
        <Box component='section' sx={{ mb: 3 }}>
          <Typography
            level='title-lg'
            endDecorator={
              <Chip size='sm' variant='solid' color='warning'>
                {pending.length}
              </Chip>
            }
            sx={{ mb: 1.25 }}
          >
            {t('shop.pending')}
          </Typography>
          <RewardsView embedded view='requests' />
        </Box>
      )}
      <Box component='section'>
        {showRequests && (
          <Typography level='title-lg' sx={{ mb: 1.25 }}>
            {t('shop.rewards')}
          </Typography>
        )}
        <RewardsView embedded view='store' />
      </Box>
    </Box>
  )
}

export default ShopView
