import { HOPLA } from '../../../constants/theme'
import { beep, loop, PALETTE, pick, pointer, setupCanvas } from './common'

// Bulles de couleur: shoot a ball up; three or more of one colour that
// touch burst, and the balls they held fall with them. A new row comes
// down every few shots; a ball past the line ends the game, an empty
// ceiling wins it.

const COLS = 8
const START_ROWS = 5
const SHOTS_PER_ROW = 7
const SPEED = 900

export const startBulles = (canvas, { onEnd, onScore }) => {
  const { ctx, h, w } = setupCanvas(canvas)
  const r = w / (COLS * 2 + 1)
  const rowH = r * Math.sqrt(3)
  const shooter = { x: w / 2, y: h - r * 2.2 }
  const maxRows = Math.floor((shooter.y - r * 3) / rowH)
  // A row is shifted right by r when (row + shift) is odd.
  let shift = 0
  const grid = new Map()
  const key = (row, col) => `${row},${col}`
  const shifted = row => (row + shift) % 2 === 1
  const colsIn = row => (shifted(row) ? COLS - 1 : COLS)
  const at = (row, col) => ({
    x: r + col * 2 * r + (shifted(row) ? r : 0),
    y: r + row * rowH,
  })
  const neighbours = (row, col) => {
    const side = shifted(row) ? [col, col + 1] : [col - 1, col]
    return [
      [row, col - 1],
      [row, col + 1],
      ...side.flatMap(c => [
        [row - 1, c],
        [row + 1, c],
      ]),
    ].filter(([y, x]) => y >= 0 && x >= 0 && x < colsIn(y))
  }

  for (let row = 0; row < START_ROWS; row++)
    for (let col = 0; col < colsIn(row); col++)
      grid.set(key(row, col), { color: pick(PALETTE) })

  const colours = () => {
    const left = new Set([...grid.values()].map(b => b.color))
    return left.size ? [...left] : PALETTE
  }
  let current = pick(colours())
  let next = pick(colours())
  let aim = -Math.PI / 2
  let ball = null
  let shots = 0
  let score = 0
  let result = null

  const addRow = () => {
    const moved = [...grid.entries()].map(([k, b]) => {
      const [row, col] = k.split(',').map(Number)
      return [row + 1, col, b]
    })
    grid.clear()
    shift ^= 1
    for (const [row, col, b] of moved) grid.set(key(row, col), b)
    for (let col = 0; col < colsIn(0); col++)
      grid.set(key(0, col), { color: pick(colours()) })
  }

  const snap = (x, y) => {
    let best = null
    const row0 = Math.max(0, Math.round((y - r) / rowH))
    for (let row = Math.max(0, row0 - 1); row <= row0 + 1; row++)
      for (let col = 0; col < colsIn(row); col++) {
        if (grid.has(key(row, col))) continue
        const p = at(row, col)
        const d = Math.hypot(p.x - x, p.y - y)
        if (!best || d < best.d) best = { row, col, d }
      }
    return best
  }

  const settle = (row, col, color) => {
    grid.set(key(row, col), { color })
    const same = new Set([key(row, col)])
    const todo = [[row, col]]
    while (todo.length) {
      const [y, x] = todo.pop()
      for (const [ny, nx] of neighbours(y, x)) {
        const k = key(ny, nx)
        if (!same.has(k) && grid.get(k)?.color === color) {
          same.add(k)
          todo.push([ny, nx])
        }
      }
    }
    if (same.size >= 3) {
      for (const k of same) grid.delete(k)
      score += same.size * 10
      // The balls no longer held by the ceiling fall too.
      const held = new Set()
      const stack = []
      for (let c = 0; c < colsIn(0); c++)
        if (grid.has(key(0, c))) {
          held.add(key(0, c))
          stack.push([0, c])
        }
      while (stack.length) {
        const [y, x] = stack.pop()
        for (const [ny, nx] of neighbours(y, x)) {
          const k = key(ny, nx)
          if (grid.has(k) && !held.has(k)) {
            held.add(k)
            stack.push([ny, nx])
          }
        }
      }
      let fell = 0
      for (const k of [...grid.keys()])
        if (!held.has(k)) {
          grid.delete(k)
          fell += 1
        }
      score += fell * 20
      onScore(score)
      beep(520 + Math.min(same.size + fell, 10) * 40, 0.12)
    } else {
      beep(300, 0.05, 0.08)
    }
    shots += 1
    if (grid.size === 0) {
      score += 500
      onScore(score)
      result = 'won'
      return
    }
    if (shots % SHOTS_PER_ROW === 0) addRow()
    for (const k of grid.keys())
      if (Number(k.split(',')[0]) >= maxRows) result = 'lost'
  }

  const aimAt = event => {
    const p = pointer(canvas, event)
    const angle = Math.atan2(p.y - shooter.y, p.x - shooter.x)
    aim = Math.max(-Math.PI + 0.18, Math.min(-0.18, angle))
  }
  const shoot = event => {
    aimAt(event)
    if (ball || result) return
    ball = {
      x: shooter.x,
      y: shooter.y,
      vx: Math.cos(aim) * SPEED,
      vy: Math.sin(aim) * SPEED,
      color: current,
    }
    current = next
    next = pick(colours())
  }
  canvas.addEventListener('pointermove', aimAt)
  canvas.addEventListener('pointerdown', aimAt)
  canvas.addEventListener('pointerup', shoot)

  const drawBall = (x, y, color, radius = r) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, radius * 0.92, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.45)'
    ctx.beginPath()
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.25, 0, Math.PI * 2)
    ctx.fill()
  }

  const stop = loop(dt => {
    if (ball) {
      // Small steps, so a fast ball cannot pass through another.
      const steps = 4
      for (let i = 0; i < steps && ball; i++) {
        ball.x += (ball.vx * dt) / steps
        ball.y += (ball.vy * dt) / steps
        if (ball.x < r) {
          ball.x = r
          ball.vx = Math.abs(ball.vx)
        }
        if (ball.x > w - r) {
          ball.x = w - r
          ball.vx = -Math.abs(ball.vx)
        }
        let hit = ball.y <= r
        if (!hit)
          for (const k of grid.keys()) {
            const [row, col] = k.split(',').map(Number)
            const p = at(row, col)
            if (Math.hypot(p.x - ball.x, p.y - ball.y) < r * 1.75) {
              hit = true
              break
            }
          }
        if (hit) {
          const spot = snap(ball.x, ball.y)
          if (spot) settle(spot.row, spot.col, ball.color)
          ball = null
        }
      }
    }

    ctx.fillStyle = '#F4F1FF'
    ctx.fillRect(0, 0, w, h)
    const line = r + maxRows * rowH - r
    ctx.strokeStyle = HOPLA.carrot
    ctx.setLineDash([6, 6])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, line)
    ctx.lineTo(w, line)
    ctx.stroke()
    ctx.setLineDash([])
    for (const [k, b] of grid) {
      const [row, col] = k.split(',').map(Number)
      const p = at(row, col)
      drawBall(p.x, p.y, b.color)
    }
    // The aim, as dots.
    ctx.fillStyle = 'rgba(36,30,78,.35)'
    for (let i = 1; i < 9; i++) {
      ctx.beginPath()
      ctx.arc(
        shooter.x + Math.cos(aim) * i * r * 1.4,
        shooter.y + Math.sin(aim) * i * r * 1.4,
        2.5,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
    if (ball) drawBall(ball.x, ball.y, ball.color)
    drawBall(shooter.x, shooter.y, current)
    drawBall(shooter.x + r * 3, shooter.y + r * 0.6, next, r * 0.6)
    if (result) {
      onEnd(score)
      return false
    }
  })

  return {
    stop: () => {
      stop()
      canvas.removeEventListener('pointermove', aimAt)
      canvas.removeEventListener('pointerdown', aimAt)
      canvas.removeEventListener('pointerup', shoot)
    },
  }
}
