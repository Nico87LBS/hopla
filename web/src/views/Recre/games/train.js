import { HOPLA } from '../../../constants/theme'
import {
  beep,
  drawCarrot,
  drawRabbit,
  GRASS,
  GRASS_DARK,
  loop,
  setupCanvas,
} from './common'

// Le train des lapereaux: the rabbit eats carrots and a line of little
// rabbits grows behind it. Bumping into the hedge or the line ends it.

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const BABIES = ['#FFFFFF', '#F3E7DA', '#E9E1F7']

export const startTrain = (canvas, { onEnd, onScore }) => {
  const { ctx, h, w } = setupCanvas(canvas)
  const cols = 12
  const cell = Math.floor(Math.min(w / cols, h / 12))
  const rows = Math.floor(h / cell)
  const ox = (w - cols * cell) / 2
  const oy = (h - rows * cell) / 2
  const mid = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }
  let body = [mid, { x: mid.x, y: mid.y + 1 }, { x: mid.x, y: mid.y + 2 }]
  let dir = DIRS.up
  let next = DIRS.up
  let score = 0
  let wait = 0
  let over = false
  // The rabbit waits for the first turn, so nobody loses before starting.
  let started = false

  const free = () => {
    for (;;) {
      const spot = {
        x: Math.floor(Math.random() * cols),
        y: Math.floor(Math.random() * rows),
      }
      if (!body.some(p => p.x === spot.x && p.y === spot.y)) return spot
    }
  }
  let carrot = free()

  const step = () => {
    dir = next
    const head = { x: body[0].x + dir.x, y: body[0].y + dir.y }
    const ate = head.x === carrot.x && head.y === carrot.y
    const rest = ate ? body : body.slice(0, -1)
    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= cols ||
      head.y >= rows ||
      rest.some(p => p.x === head.x && p.y === head.y)
    ) {
      over = true
      beep(160, 0.4)
      return
    }
    body = [head, ...rest]
    if (ate) {
      score += 1
      onScore(score)
      beep(660, 0.08)
      carrot = free()
    }
  }

  const draw = () => {
    ctx.fillStyle = GRASS
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if ((x + y) % 2) {
          ctx.fillStyle = GRASS_DARK
          ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell)
        }
    ctx.strokeStyle = HOPLA.green
    ctx.lineWidth = 3
    ctx.strokeRect(ox, oy, cols * cell, rows * cell)
    const at = p => ({
      x: ox + p.x * cell + cell / 2,
      y: oy + p.y * cell + cell / 2,
    })
    const c = at(carrot)
    drawCarrot(ctx, c.x, c.y, cell * 0.9, { angle: 0.4 })
    for (let i = body.length - 1; i >= 1; i--) {
      const p = at(body[i])
      ctx.fillStyle = BABIES[i % BABIES.length]
      ctx.strokeStyle = HOPLA.ink
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, cell * 0.36, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    const head = at(body[0])
    drawRabbit(ctx, head.x, head.y, cell * 1.05, {
      angle: Math.atan2(dir.y, dir.x),
    })
  }

  const stop = loop(dt => {
    wait -= dt
    if (started && wait <= 0) {
      step()
      wait = Math.max(0.1, 0.26 - score * 0.008)
    }
    draw()
    if (over) {
      onEnd(score)
      return false
    }
  })

  const input = name => {
    const want = DIRS[name]
    started = true
    if (want && (want.x !== -dir.x || want.y !== -dir.y)) next = want
  }

  // Swipes on the meadow turn the rabbit too.
  let from = null
  const down = event => (from = { x: event.clientX, y: event.clientY })
  const up = event => {
    if (!from) return
    const dx = event.clientX - from.x
    const dy = event.clientY - from.y
    from = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
    if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? 'right' : 'left')
    else input(dy > 0 ? 'down' : 'up')
  }
  const key = event => {
    const name = event.key.replace('Arrow', '').toLowerCase()
    if (DIRS[name]) {
      event.preventDefault()
      input(name)
    }
  }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointerup', up)
  window.addEventListener('keydown', key)
  return {
    input,
    stop: () => {
      stop()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key)
    },
  }
}
