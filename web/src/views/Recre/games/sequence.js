import { HOPLA } from '../../../constants/theme'
import { beep, loop, pointer, roundRect, setupCanvas } from './common'

// La séquence des couleurs: Hopla lights a run of colours with their notes;
// the child plays it back, and it grows by one each round.

const PADS = [
  { color: HOPLA.carrot, note: 330, shape: 'circle' },
  { color: HOPLA.violet, note: 392, shape: 'square' },
  { color: HOPLA.green, note: 494, shape: 'triangle' },
  { color: HOPLA.gold, note: 587, shape: 'diamond' },
]

export const startSequence = (canvas, { onEnd, onHint, onScore }) => {
  const { ctx, h, w } = setupCanvas(canvas)
  const gap = 14
  const side = Math.min((w - gap * 3) / 2, (h - gap * 3) / 2)
  const ox = (w - side * 2 - gap) / 2
  const oy = (h - side * 2 - gap) / 2
  const rect = i => ({
    x: ox + (i % 2) * (side + gap),
    y: oy + Math.floor(i / 2) * (side + gap),
  })
  let run = [Math.floor(Math.random() * 4)]
  let phase = 'show'
  let index = 0
  let clock = 0.8
  let lit = -1
  let litLeft = 0
  let score = 0
  let done = false
  let shownPhase = ''

  const light = i => {
    lit = i
    litLeft = 0.32
    beep(PADS[i].note, 0.3, 0.2)
  }

  const touch = event => {
    if (phase !== 'play') return
    const p = pointer(canvas, event)
    const i = [0, 1, 2, 3].find(k => {
      const r = rect(k)
      return p.x >= r.x && p.x <= r.x + side && p.y >= r.y && p.y <= r.y + side
    })
    if (i === undefined) return
    light(i)
    if (i !== run[index]) {
      beep(140, 0.5, 0.2)
      phase = 'over'
      clock = 0.6
      return
    }
    index += 1
    if (index === run.length) {
      score = run.length
      onScore(score)
      run = [...run, Math.floor(Math.random() * 4)]
      phase = 'show'
      index = 0
      clock = 0.9
    }
  }
  canvas.addEventListener('pointerdown', touch)

  const drawShape = (shape, x, y, s) => {
    ctx.fillStyle = 'rgba(255,255,255,.85)'
    ctx.beginPath()
    if (shape === 'circle') ctx.arc(x, y, s, 0, Math.PI * 2)
    if (shape === 'square') ctx.rect(x - s, y - s, s * 2, s * 2)
    if (shape === 'triangle') {
      ctx.moveTo(x, y - s * 1.1)
      ctx.lineTo(x + s * 1.1, y + s * 0.9)
      ctx.lineTo(x - s * 1.1, y + s * 0.9)
    }
    if (shape === 'diamond') {
      ctx.moveTo(x, y - s * 1.2)
      ctx.lineTo(x + s, y)
      ctx.lineTo(x, y + s * 1.2)
      ctx.lineTo(x - s, y)
    }
    ctx.fill()
  }

  const stop = loop(dt => {
    litLeft -= dt
    if (litLeft <= 0) lit = -1
    clock -= dt
    if (phase === 'show' && clock <= 0) {
      if (index < run.length) {
        light(run[index])
        index += 1
        clock = Math.max(0.35, 0.6 - run.length * 0.02)
      } else {
        phase = 'play'
        index = 0
      }
    }
    if (phase === 'over' && clock <= 0) done = true

    ctx.fillStyle = HOPLA.violetSoft
    ctx.fillRect(0, 0, w, h)
    if (phase !== shownPhase) {
      shownPhase = phase
      onHint?.(phase === 'show' ? 'watch' : phase === 'play' ? 'play' : '')
    }
    PADS.forEach((pad, i) => {
      const r = rect(i)
      ctx.globalAlpha = lit === i ? 1 : 0.55
      ctx.fillStyle = pad.color
      roundRect(ctx, r.x, r.y, side, side, 22)
      ctx.fill()
      ctx.globalAlpha = 1
      if (lit === i) {
        ctx.strokeStyle = HOPLA.ink
        ctx.lineWidth = 4
        roundRect(ctx, r.x, r.y, side, side, 22)
        ctx.stroke()
      }
      drawShape(pad.shape, r.x + side / 2, r.y + side / 2, side * 0.16)
    })
    if (done) {
      onEnd(score)
      return false
    }
  })

  return {
    stop: () => {
      stop()
      canvas.removeEventListener('pointerdown', touch)
    },
  }
}
