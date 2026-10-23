import { Box, Typography } from '@mui/joy'
import PropTypes from 'prop-types'

// One block of the task editor: a white card with its question as title.
export default function EditorCard({ children, error, section, sx, title }) {
  return (
    <Box
      component='section'
      data-editor-section={section}
      aria-label={title}
      sx={{
        bgcolor: 'background.surface',
        border: '1px solid',
        borderColor: error ? 'danger.outlinedBorder' : 'divider',
        borderRadius: '20px',
        p: { xs: 2, sm: 2.25 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        minWidth: 0,
        ...sx,
      }}
    >
      {title && (
        <Typography
          component='h2'
          sx={{ fontFamily: 'display', fontSize: 17, fontWeight: 600 }}
        >
          {title}
        </Typography>
      )}
      {children}
      {error && (
        <Typography level='body-sm' color='danger' role='alert'>
          {error}
        </Typography>
      )}
    </Box>
  )
}

EditorCard.propTypes = {
  children: PropTypes.node,
  error: PropTypes.node,
  section: PropTypes.string.isRequired,
  sx: PropTypes.object,
  title: PropTypes.node,
}

// A small grey label above a group of controls inside a card.
export const FieldLabel = ({ children, id }) => (
  <Typography
    id={id}
    level='body-sm'
    sx={{ color: 'text.secondary', fontWeight: 600 }}
  >
    {children}
  </Typography>
)

FieldLabel.propTypes = { children: PropTypes.node, id: PropTypes.string }

// Segmented choice: a row of buttons where exactly one is picked.
export const Segmented = ({ label, onChange, options, value }) => (
  <Box
    role='radiogroup'
    aria-label={label}
    sx={{
      display: 'grid',
      gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      gap: '2px',
      p: '3px',
      bgcolor: 'background.level1',
      borderRadius: '12px',
    }}
  >
    {options.map(option => {
      const selected = option.value === value
      return (
        <Box
          key={option.value}
          component='button'
          type='button'
          role='radio'
          aria-checked={selected}
          onClick={() => onChange(option.value)}
          sx={{
            minHeight: 40,
            px: 0.5,
            border: 0,
            borderRadius: '10px',
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            bgcolor: selected ? 'background.surface' : 'transparent',
            color: selected ? 'text.primary' : 'text.secondary',
            boxShadow: selected ? 'sm' : 'none',
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.500',
            },
          }}
        >
          {option.label}
        </Box>
      )
    })}
  </Box>
)

Segmented.propTypes = {
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({ label: PropTypes.node, value: PropTypes.string }),
  ).isRequired,
  value: PropTypes.string,
}

// A pill to pick, like a day of the week or a date shortcut.
export const Pill = ({ children, label, onClick, selected, sx }) => (
  <Box
    component='button'
    type='button'
    aria-pressed={selected}
    aria-label={label}
    onClick={onClick}
    sx={{
      minHeight: 40,
      px: 1.75,
      border: '1px solid',
      borderColor: selected ? 'primary.300' : 'divider',
      bgcolor: selected ? 'primary.softBg' : 'background.surface',
      color: selected ? 'primary.softColor' : 'text.primary',
      borderRadius: '20px',
      cursor: 'pointer',
      font: 'inherit',
      fontSize: 14,
      fontWeight: 600,
      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.500' },
      ...sx,
    }}
  >
    {children}
  </Box>
)

Pill.propTypes = {
  children: PropTypes.node,
  label: PropTypes.string,
  onClick: PropTypes.func,
  selected: PropTypes.bool,
  sx: PropTypes.object,
}
