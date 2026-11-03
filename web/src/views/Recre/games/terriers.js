import { HOPLA } from '../../../constants/theme'
import {
  beep,
  drawRabbit,
  GRASS,
  GRASS_DARK,
  loop,
  pointer,
  random,
  setupCanvas,
} from './common'

// Coucou les lapins: rabbits pop out of nine burrows; touch them before
// they go back in. Five rabbits gone back unseen end the game.

const MISSES = 5

export const startTerriers = (canvas, { onEnd, onScore }) => {
  const { ctx, h, w } = setupCanvas(canvas)
  const size = Math.min(w / 3, (h - 50) / 3)
  const ox = (w - size * 3) / 2
  const oy = 50 + (h - 50 - size * 3) / 2
  const holes = Array.from({ length: 9 }, (_, i) => ({
    x: ox + (i % 3) * size + size / 2,
    y: oy + Math.floor(i / 3) * size + size * 0.62,
    rabbit: null,
  }))
  let score = 0
  let missed = 0
  let time = 0
  let wait = 0.8

  const touch = event => {
    const p = pointer(canvas, event)
    for (const hole of holes) {
      const r = hole.rabbit
      if (!r || r.caught) continue
      if (
        Math.hypot(p.x - hole.x, p.y - (hole.y - size * 0.28)) <
        size * 0.38
      ) {
        r.caught = true
        r.left = Math.min(r.left, 0.25)
        score += 1
        onScore(score)
        beep(700 + Math.random() * 200, 0.08)
        return
      }
    }
  }
  canvas.addEventListener('pointerdown', touch)

  const stop = loop(dt => {
    time += dt
    wait -= dt
    if (wait <= 0) {
      const empty = holes.filter(hole => !hole.rabbit)
      const count = time > 25 && Math.random() < 0.35 ? 2 : 1
      for (let i = 0; i < count && empty.length; i++) {
        const hole = empty.splice(
          Math.floor(Math.random() * empty.length),
          1,
        )[0]
        const stay = Math.max(0.65, 1.5 - time * 0.02)
        hole.rabbit = {
          left: stay,
          stay,
          caught: false,
          golden: Math.random() < 0.1,
        }
      }
      wait = Math.max(0.45, random(0.7, 1.2) - time * 0.012)
    }
    for (const hole of holes) {
      const r = hole.rabbit
      if (!r) continue
      r.left -= dt
      if (r.left <= 0) {
        if (!r.caught) {
          missed += 1
          beep(220, 0.15)
        }
        hole.rabbit = null
      }
    }

    ctx.fillStyle = GRASS
    ctx.fillRect(0, 0, w, h)
    holes.forEach((hole, i) => {
      ctx.fillStyle = i % 2 ? GRASS_DARK : GRASS
      ctx.fillRect(hole.x - size / 2, hole.y - size * 0.62, size, size)
    })
    for (const hole of holes) {
      ctx.fillStyle = '#6B4A2B'
      ctx.beginPath()
      ctx.ellipse(hole.x, hole.y, size * 0.36, size * 0.13, 0, 0, Math.PI * 2)
      ctx.fill()
      const r = hole.rabbit
      if (r) {
        const shown = Math.min(1, (r.stay - r.left) / 0.15, r.left / 0.15)
        ctx.save()
        ctx.beginPath()
        ctx.rect(hole.x - size / 2, hole.y - size, size, size)
        ctx.clip()
        drawRabbit(
          ctx,
          hole.x,
          hole.y + size * 0.3 - shown * size * 0.55,
          size * 0.6,
          {
            color: r.caught ? HOPLA.greenSoft : '#FFFFFF',
          },
        )
        ctx.restore()
      }
      ctx.fillStyle = '#8B6440'
      ctx.beginPath()
      ctx.ellipse(
        hole.x,
        hole.y + size * 0.05,
        size * 0.4,
        size * 0.08,
        0,
        0,
        Math.PI,
      )
      ctx.fill()
    }
    // The rabbits that got away, as empty and full circles.
    for (let i = 0; i < MISSES; i++) {
      ctx.fillStyle = i < missed ? HOPLA.carrot : '#D9D6E3'
      ctx.beginPath()
      ctx.arc(w - 20 - i * 22, 24, 8, 0, Math.PI * 2)
      ctx.fill()
    }
    if (missed >= MISSES) {
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
