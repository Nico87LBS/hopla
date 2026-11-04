import {
  AddRounded,
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  DeleteOutlineRounded,
  ImageOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Input,
  Option,
  Select,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ZONE_PICTURES } from '../../utils/learn/drawings'
import { GROUPS, LIMITS } from '../../utils/learn/labelCards'
import { DrawingGrid } from './CardOptions'
import { drawingURL, ZonePicture } from './PlayModes'

// Thumb shows the drawing of a label, or a button to pick one.
const Thumb = ({ label, onClick, open, value }) => (
  <IconButton
    size='sm'
    variant={open ? 'soft' : 'outlined'}
    color='neutral'
    aria-label={label}
    aria-expanded={open}
    onClick={onClick}
    sx={{ flexShrink: 0, width: 36, height: 36, p: 0.25 }}
  >
    {value ? (
      <Box
        component='img'
        src={drawingURL(value)}
        alt=''
        sx={{ width: 30, height: 30 }}
      />
    ) : (
      <ImageOutlined />
    )}
  </IconButton>
)

Thumb.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  open: PropTypes.bool,
  value: PropTypes.string,
}

// usePicking remembers which label picks its drawing, one at a time.
const usePicking = () => {
  const [picking, setPicking] = useState('')
  return {
    is: key => picking === key,
    toggle: key => setPicking(current => (current === key ? '' : key)),
    done: () => setPicking(''),
  }
}

const Title = ({ children, help }) => (
  <Box>
    <Typography level='title-sm'>{children}</Typography>
    {help && (
      <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
        {help}
      </Typography>
    )}
  </Box>
)

Title.propTypes = { children: PropTypes.node, help: PropTypes.node }

const Remove = ({ label, onClick }) => (
  <IconButton
    size='sm'
    variant='plain'
    color='neutral'
    aria-label={label}
    onClick={onClick}
  >
    <DeleteOutlineRounded />
  </IconButton>
)

Remove.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
}

const Add = ({ children, disabled, onClick }) => (
  <Button
    size='sm'
    variant='plain'
    startDecorator={<AddRounded />}
    disabled={disabled}
    onClick={onClick}
    sx={{ alignSelf: 'flex-start' }}
  >
    {children}
  </Button>
)

Add.propTypes = {
  children: PropTypes.node,
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
}

const without = (list, index) => list.filter((_, i) => i !== index)
const replace = (list, index, value) =>
  list.map((item, i) => (i === index ? value : item))

// PairRows edits the pairs to match, a word or a drawing on each side.
const PairRows = ({ onChange, pairs }) => {
  const { t } = useTranslation('learn')
  const picking = usePicking()
  const [, max] = LIMITS.paires
  const side = (pair, index, at) => {
    const key = `${index}-${at}`
    const value = pair[at]
    const set = next =>
      onChange(
        replace(
          pairs,
          index,
          pair.map((s, i) => (i === at ? { ...s, ...next } : s)),
        ),
      )
    return (
      <Box key={at}>
        <Stack direction='row' gap={0.75} alignItems='center'>
          <Input
            size='sm'
            sx={{ flex: 1, minWidth: 0 }}
            aria-label={t(at ? 'labels.right' : 'labels.left', {
              n: index + 1,
            })}
            placeholder={t(at ? 'labels.rightHint' : 'labels.leftHint')}
            value={value.texte}
            onChange={e => set({ texte: e.target.value })}
          />
          <Thumb
            label={t('labels.drawing')}
            value={value.image}
            open={picking.is(key)}
            onClick={() => picking.toggle(key)}
          />
        </Stack>
        {picking.is(key) && (
          <Stack gap={0.5}>
            <DrawingGrid
              value={value.image}
              onPick={name => {
                set({ image: name })
                picking.done()
              }}
            />
            {value.image && (
              <Button
                size='sm'
                variant='plain'
                color='neutral'
                onClick={() => {
                  set({ image: '' })
                  picking.done()
                }}
              >
                {t('options.imageRemove')}
              </Button>
            )}
          </Stack>
        )}
      </Box>
    )
  }
  return (
    <Stack gap={1}>
      <Title help={t('labels.pairsHelp')}>{t('labels.pairs')}</Title>
      {pairs.map((pair, index) => (
        <Sheet
          key={index}
          variant='outlined'
          sx={{ borderRadius: 'md', p: 1, display: 'flex', gap: 0.5 }}
        >
          <Stack gap={0.75} sx={{ flex: 1, minWidth: 0 }}>
            {side(pair, index, 0)}
            {side(pair, index, 1)}
          </Stack>
          <Remove
            label={t('labels.removePair', { n: index + 1 })}
            onClick={() => onChange(without(pairs, index))}
          />
        </Sheet>
      ))}
      <Add
        disabled={pairs.length >= max}
        onClick={() =>
          onChange([
            ...pairs,
            [
              { texte: '', image: '' },
              { texte: '', image: '' },
            ],
          ])
        }
      >
        {t('labels.addPair')}
      </Add>
    </Stack>
  )
}

PairRows.propTypes = {
  onChange: PropTypes.func.isRequired,
  pairs: PropTypes.array.isRequired,
}

// OrderRows edits the labels in their right order; labels of the same
// letter may swap (getting dressed and having breakfast).
const OrderRows = ({ elements, onChange }) => {
  const { t } = useTranslation('learn')
  const [, max] = LIMITS.elements
  const move = (index, by) => {
    const next = [...elements]
    const [row] = next.splice(index, 1)
    next.splice(index + by, 0, row)
    onChange(next)
  }
  return (
    <Stack gap={1}>
      <Title help={t('labels.elementsHelp')}>{t('labels.elements')}</Title>
      {elements.map((row, index) => (
        <Stack key={index} direction='row' gap={0.5} alignItems='center'>
          <Typography
            level='body-sm'
            sx={{ width: 18, textAlign: 'right', color: 'text.tertiary' }}
          >
            {index + 1}
          </Typography>
          <Input
            size='sm'
            sx={{ flex: 1, minWidth: 0 }}
            aria-label={t('labels.element', { n: index + 1 })}
            value={row.texte}
            onChange={e =>
              onChange(
                replace(elements, index, { ...row, texte: e.target.value }),
              )
            }
          />
          <Select
            size='sm'
            aria-label={t('labels.group', { n: index + 1 })}
            value={row.groupe}
            onChange={(_, value) =>
              onChange(replace(elements, index, { ...row, groupe: value }))
            }
            sx={{ minWidth: 58 }}
          >
            <Option value=''>–</Option>
            {GROUPS.map(group => (
              <Option key={group} value={group}>
                {group}
              </Option>
            ))}
          </Select>
          <IconButton
            size='sm'
            variant='plain'
            color='neutral'
            aria-label={t('labels.up', { n: index + 1 })}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUpwardRounded />
          </IconButton>
          <IconButton
            size='sm'
            variant='plain'
            color='neutral'
            aria-label={t('labels.down', { n: index + 1 })}
            disabled={index === elements.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDownwardRounded />
          </IconButton>
          <Remove
            label={t('labels.removeElement', { n: index + 1 })}
            onClick={() => onChange(without(elements, index))}
          />
        </Stack>
      ))}
      <Add
        disabled={elements.length >= max}
        onClick={() => onChange([...elements, { texte: '', groupe: '' }])}
      >
        {t('labels.addElement')}
      </Add>
    </Stack>
  )
}

OrderRows.propTypes = {
  elements: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
}

// SortRows edits the boxes, each with its rule, and the labels to sort
// into them, each with why it goes there.
const SortRows = ({ boxes, items, onChange }) => {
  const { t } = useTranslation('learn')
  const picking = usePicking()
  const names = boxes.map(box => box.nom.trim()).filter(Boolean)
  const grid = (key, value, set) =>
    picking.is(key) && (
      <DrawingGrid
        value={value}
        onPick={name => {
          set(name === value ? '' : name)
          picking.done()
        }}
      />
    )
  const setBox = (index, next) =>
    onChange({ boites: replace(boxes, index, { ...boxes[index], ...next }) })
  const setItem = (index, next) =>
    onChange({ a_classer: replace(items, index, { ...items[index], ...next }) })
  return (
    <Stack gap={2}>
      <Stack gap={1}>
        <Title help={t('labels.boxesHelp')}>{t('labels.boxes')}</Title>
        {boxes.map((box, index) => (
          <Sheet
            key={index}
            variant='outlined'
            sx={{ borderRadius: 'md', p: 1 }}
          >
            <Stack direction='row' gap={0.75} alignItems='center'>
              <Input
                size='sm'
                sx={{ flex: 1, minWidth: 0 }}
                aria-label={t('labels.box', { n: index + 1 })}
                placeholder={t('labels.boxHint')}
                value={box.nom}
                onChange={e => setBox(index, { nom: e.target.value })}
              />
              <Thumb
                label={t('labels.drawing')}
                value={box.image}
                open={picking.is(`b${index}`)}
                onClick={() => picking.toggle(`b${index}`)}
              />
              <Remove
                label={t('labels.removeBox', { n: index + 1 })}
                onClick={() => onChange({ boites: without(boxes, index) })}
              />
            </Stack>
            {grid(`b${index}`, box.image, image => setBox(index, { image }))}
            <Input
              size='sm'
              sx={{ mt: 0.75 }}
              aria-label={t('labels.rule', { n: index + 1 })}
              placeholder={t('labels.ruleHint')}
              value={box.regle}
              onChange={e => setBox(index, { regle: e.target.value })}
            />
          </Sheet>
        ))}
        <Add
          disabled={boxes.length >= LIMITS.boites[1]}
          onClick={() =>
            onChange({ boites: [...boxes, { nom: '', image: '', regle: '' }] })
          }
        >
          {t('labels.addBox')}
        </Add>
      </Stack>
      <Stack gap={1}>
        <Title help={t('labels.toSortHelp')}>{t('labels.toSort')}</Title>
        {items.map((item, index) => (
          <Sheet
            key={index}
            variant='outlined'
            sx={{ borderRadius: 'md', p: 1 }}
          >
            <Stack direction='row' gap={0.75} alignItems='center'>
              <Input
                size='sm'
                sx={{ flex: 1, minWidth: 0 }}
                aria-label={t('labels.item', { n: index + 1 })}
                value={item.texte}
                onChange={e => setItem(index, { texte: e.target.value })}
              />
              <Thumb
                label={t('labels.drawing')}
                value={item.image}
                open={picking.is(`i${index}`)}
                onClick={() => picking.toggle(`i${index}`)}
              />
              <Remove
                label={t('labels.removeItem', { n: index + 1 })}
                onClick={() => onChange({ a_classer: without(items, index) })}
              />
            </Stack>
            {grid(`i${index}`, item.image, image => setItem(index, { image }))}
            <Stack direction='row' gap={0.75} sx={{ mt: 0.75 }}>
              <Select
                size='sm'
                aria-label={t('labels.itemBox', { n: index + 1 })}
                placeholder={t('labels.itemBoxHint')}
                value={names.includes(item.boite) ? item.boite : null}
                onChange={(_, value) => setItem(index, { boite: value || '' })}
                sx={{ minWidth: 120 }}
              >
                {names.map(name => (
                  <Option key={name} value={name}>
                    {name}
                  </Option>
                ))}
              </Select>
              <Input
                size='sm'
                sx={{ flex: 1, minWidth: 0 }}
                aria-label={t('labels.itemWhy', { n: index + 1 })}
                placeholder={t('labels.itemWhyHint')}
                value={item.pourquoi}
                onChange={e => setItem(index, { pourquoi: e.target.value })}
              />
            </Stack>
          </Sheet>
        ))}
        <Add
          disabled={items.length >= LIMITS.a_classer[1]}
          onClick={() =>
            onChange({
              a_classer: [
                ...items,
                { texte: '', image: '', boite: '', pourquoi: '' },
              ],
            })
          }
        >
          {t('labels.addItem')}
        </Add>
      </Stack>
    </Stack>
  )
}

SortRows.propTypes = {
  boxes: PropTypes.array.isRequired,
  items: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
}

// ZoneChoice picks a picture in zones of the catalogue, then one of its
// zones, whose name is the answer.
export const ZoneChoice = ({ answer, onAnswer, onZone, zone }) => {
  const { t } = useTranslation('learn')
  const zones = ZONE_PICTURES[zone.picture] || []
  return (
    <Stack gap={1.5}>
      <Box>
        <Typography level='title-sm' sx={{ mb: 0.5 }}>
          {t('labels.picture')}
        </Typography>
        <Select
          value={zone.picture || null}
          placeholder={t('labels.pictureHint')}
          onChange={(_, picture) => {
            onZone({ picture: picture || '', id: '' })
            onAnswer('')
          }}
        >
          {Object.keys(ZONE_PICTURES).map(picture => (
            <Option key={picture} value={picture}>
              {t(`labels.pictures.${picture}`)}
            </Option>
          ))}
        </Select>
      </Box>
      {zone.picture && (
        <>
          <ZonePicture
            id={zone.picture}
            highlight={zone.id}
            color='#7C5CFF'
            maxHeight={220}
            onTouch={id => {
              const found = zones.find(([z]) => z === id)
              if (!found) return
              onZone({ ...zone, id })
              onAnswer(found[1])
            }}
          />
          <Box>
            <Typography level='title-sm' sx={{ mb: 0.5 }}>
              {t('labels.zone')}
            </Typography>
            <Select
              value={zones.some(([z]) => z === zone.id) ? zone.id : null}
              placeholder={t('labels.zoneHint')}
              onChange={(_, id) => {
                const found = zones.find(([z]) => z === id)
                onZone({ ...zone, id: id || '' })
                if (found) onAnswer(found[1])
              }}
            >
              {zones.map(([id, name]) => (
                <Option key={id} value={id}>
                  {name}
                </Option>
              ))}
            </Select>
          </Box>
          <Box>
            <Typography level='title-sm' sx={{ mb: 0.5 }}>
              {t('labels.zoneName')}
            </Typography>
            <Input value={answer} onChange={e => onAnswer(e.target.value)} />
          </Box>
        </>
      )}
    </Stack>
  )
}

ZoneChoice.propTypes = {
  answer: PropTypes.string.isRequired,
  onAnswer: PropTypes.func.isRequired,
  onZone: PropTypes.func.isRequired,
  zone: PropTypes.object.isRequired,
}

// LabelRows edits the labels of a card of a type: pairs, an order, or
// boxes and what to sort into them.
const LabelRows = ({ labels, onChange, type }) => {
  if (type === 'associer')
    return (
      <PairRows
        pairs={labels.paires}
        onChange={paires => onChange({ ...labels, paires })}
      />
    )
  if (type === 'ordre')
    return (
      <OrderRows
        elements={labels.elements}
        onChange={elements => onChange({ ...labels, elements })}
      />
    )
  if (type === 'classer')
    return (
      <SortRows
        boxes={labels.boites}
        items={labels.a_classer}
        onChange={change => onChange({ ...labels, ...change })}
      />
    )
  return null
}

LabelRows.propTypes = {
  labels: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  type: PropTypes.string.isRequired,
}

export default LabelRows
