import { Tab, TabList, Tabs } from '@mui/joy'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import { selectedTabSx } from '../../constants/theme'

// PageTabs are the tabs at the top of a Gérer page: one address per tab,
// so the back button and a shared link land on the right one.
const PageTabs = ({ current, tabs }) => (
  <Tabs
    value={current}
    size='sm'
    sx={{ bgcolor: 'background.level1', borderRadius: 'lg', p: 0.5 }}
  >
    <TabList disableUnderline sx={{ gap: 0.25 }}>
      {tabs.map(tab => (
        <Tab
          key={tab.value}
          value={tab.value}
          component={Link}
          to={tab.to}
          replace
          disableIndicator
          sx={[
            {
              flex: 1,
              borderRadius: 'md',
              minHeight: 40,
              px: 1,
            },
            selectedTabSx,
          ]}
        >
          {tab.label}
        </Tab>
      ))}
    </TabList>
  </Tabs>
)

PageTabs.propTypes = {
  current: PropTypes.string.isRequired,
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.node.isRequired,
      to: PropTypes.string.isRequired,
      value: PropTypes.string.isRequired,
    }),
  ).isRequired,
}

export default PageTabs
