import { CloseRounded, SearchRounded, SortRounded } from '@mui/icons-material'
import {
  Box,
  Chip,
  IconButton,
  Input,
  Option,
  Select,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'

const read = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

// useListChoices keeps the filters and the sort of a list on this device;
// the search is not kept.
export const useListChoices = (key, fallback) => {
  const [choices, setChoices] = useState(() => read(key, fallback))
  const change = next => {
    setChoices(current => {
      const value = { ...current, ...next }
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // A device that keeps nothing forgets the choices.
      }
      return value
    })
  }
  return [choices, change]
}

const chipSx = on => ({
  border: '1px solid',
  borderColor: on ? HOPLA.violet : 'neutral.outlinedBorder',
  color: on ? '#fff' : 'text.primary',
  fontWeight: on ? 700 : 500,
})

// The chip's button carries its colour: Joy paints it over the chip.
const actionSx = on => ({
  bgcolor: on ? HOPLA.violet : 'background.surface',
  // Safari keeps :hover after a touch, so only a mouse shows it.
  '&:hover': { bgcolor: on ? HOPLA.violet : 'background.surface' },
  '@media (hover: hover)': {
    '&:hover': on ? {} : { bgcolor: HOPLA.violetSoft },
  },
})

const Toggle = ({ label, on, onClick }) => (
  <Chip
    size='md'
    variant='plain'
    onClick={onClick}
    sx={chipSx(on)}
    slotProps={{ action: { 'aria-pressed': on, sx: actionSx(on) } }}
  >
    {label}
  </Chip>
)

Toggle.propTypes = {
  label: PropTypes.string.isRequired,
  on: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
}

// ListBar searches, filters and sorts a list of modules: a search box, the
// filters and the levels to pick, any number of them, and how to sort.
const ListBar = ({
  choices,
  count,
  filters = [],
  levels = [],
  onChoices,
  onQuery,
  query,
  sorts = [],
}) => {
  const { t } = useTranslation('learn')
  const picked = new Set(choices.filters || [])
  const pickedLevels = new Set(choices.levels || [])
  const toggle = (set, value, field, exclusive = []) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else {
      next.add(value)
      exclusive.forEach(other => next.delete(other))
    }
    onChoices({ [field]: [...next] })
  }
  const any = query || picked.size > 0 || pickedLevels.size > 0
  const clear = () => {
    onQuery('')
    onChoices({ filters: [], levels: [] })
  }

  return (
    <Stack gap={1} sx={{ mb: 2 }}>
      <Stack direction='row' gap={1} alignItems='center'>
        <Input
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder={t('list.search')}
          startDecorator={<SearchRounded />}
          endDecorator={
            query && (
              <IconButton
                size='sm'
                variant='plain'
                aria-label={t('list.clearSearch')}
                onClick={() => onQuery('')}
              >
                <CloseRounded />
              </IconButton>
            )
          }
          slotProps={{ input: { 'aria-label': t('list.search') } }}
          sx={{ flex: 1, minWidth: 0 }}
        />
        {sorts.length > 1 && (
          <Select
            value={choices.sort}
            onChange={(_, value) => value && onChoices({ sort: value })}
            startDecorator={<SortRounded />}
            aria-label={t('list.sortBy')}
            sx={{ flexShrink: 0, minWidth: { xs: 0, sm: 170 } }}
            renderValue={option => (
              <Typography
                level='body-sm'
                noWrap
                sx={{ display: { xs: 'none', sm: 'block' } }}
              >
                {option?.label}
              </Typography>
            )}
          >
            {sorts.map(sort => (
              <Option key={sort.key} value={sort.key} label={sort.label}>
                {sort.label}
              </Option>
            ))}
          </Select>
        )}
      </Stack>
      {(filters.length > 0 || levels.length > 1) && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            alignItems: 'center',
          }}
        >
          {filters.map(filter => (
            <Toggle
              key={filter.key}
              label={
                filter.count === undefined
                  ? filter.label
                  : `${filter.label} · ${filter.count}`
              }
              on={picked.has(filter.key)}
              onClick={() =>
                toggle(picked, filter.key, 'filters', filter.exclusive)
              }
            />
          ))}
          {filters.length > 0 && levels.length > 1 && (
            <Box
              sx={{ width: '1px', height: 20, bgcolor: 'divider', mx: 0.25 }}
            />
          )}
          {levels.length > 1 &&
            levels.map(level => (
              <Toggle
                key={level}
                label={level}
                on={pickedLevels.has(level)}
                onClick={() => toggle(pickedLevels, level, 'levels')}
              />
            ))}
        </Box>
      )}
      {any && (
        <Stack direction='row' gap={1} alignItems='center'>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {t('list.shown', { count })}
          </Typography>
          <Chip
            size='sm'
            variant='plain'
            onClick={clear}
            startDecorator={<CloseRounded />}
            sx={{ color: HOPLA.violet, fontWeight: 600 }}
          >
            {t('list.clear')}
          </Chip>
        </Stack>
      )}
    </Stack>
  )
}

ListBar.propTypes = {
  choices: PropTypes.object.isRequired,
  count: PropTypes.number.isRequired,
  filters: PropTypes.array,
  levels: PropTypes.array,
  onChoices: PropTypes.func.isRequired,
  onQuery: PropTypes.func.isRequired,
  query: PropTypes.string.isRequired,
  sorts: PropTypes.array,
}

export default ListBar
