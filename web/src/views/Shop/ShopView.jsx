import { Box, Chip, Container, Typography } from '@mui/joy'
import { useTranslation } from 'react-i18next'

import { useIsParent } from '../../hooks/useIsParent'
import { useRedemptions } from '../Rewards/RewardQueries'
import RewardsView from '../Rewards/RewardsView'

// Spending hops. Parents see the requests waiting for them first.
const ShopView = () => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  const { data: pending = [] } = useRedemptions('pending')
  const showRequests = isParent && pending.length > 0

  return (
    <Container
      maxWidth='md'
      sx={{ px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 3 } }}
    >
      <Typography
        level='h2'
        sx={{ display: { xs: 'none', lg: 'block' }, mb: 2 }}
      >
        {t('navigation.shop')}
      </Typography>
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
    </Container>
  )
}

export default ShopView
