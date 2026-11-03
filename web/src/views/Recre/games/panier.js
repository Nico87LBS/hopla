import { HOPLA } from '../../../constants/theme'
import {
  beep,
  drawCarrot,
  GRASS,
  loop,
  pointer,
  random,
  roundRect,
  setupCanvas,
} from './common'

// Le panier à carottes: carrots fall, the basket catches them; a golden
// one is worth five, a stone costs one of the three hearts.

export const startPanier = (canvas, { onEnd, onScore }) => {
  const { ctx, h, w } = setupCanvas(canvas)
  const basket = { w: Math.min(110, w * 0.26), h: 34, x: w / 2 }
  const top = h - 60
  let items = []
  let score = 0
  let lives = 3
  let time = 0
  let spawn = 0.6

  const move = event => {
    basket.x = Math.max(
      basket.w / 2,
      Math.min(w - basket.w / 2, pointer(canvas, event).x),
    )
  }
  const key = event => {
    if (event.key === 'ArrowLeft')
      basket.x = Math.max(basket.w / 2, basket.x - 30)
    if (event.key === 'ArrowRight')
      basket.x = Math.min(w - basket.w / 2, basket.x + 30)
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerdown', move)
  window.addEventListener('keydown', key)

  const drawStone = (x, y, r) => {
    ctx.fillStyle = '#8D8A99'
    ctx.strokeStyle = HOPLA.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.8, 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  const drawHeart = (x, y, s, full) => {
    ctx.fillStyle = full ? HOPLA.red : '#D9D6E3'
    ctx.beginPath()
    ctx.moveTo(x, y + s * 0.3)
    ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.35)
    ctx.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.3)
    ctx.fill()
  }

  const stop = loop(dt => {
    time += dt
    spawn -= dt
    const speed = Math.min(380, 150 + time * 5)
    if (spawn <= 0) {
      const roll = Math.random()
      items.push({
        x: random(20, w - 20),
        y: -20,
        kind:
          roll < 0.08
            ? 'gold'
            : roll < 0.08 + Math.min(0.32, 0.18 + time / 300)
              ? 'stone'
              : 'carrot',
        spin: random(-2, 2),
        angle: 0,
      })
      spawn = Math.max(0.35, 0.95 - time * 0.012)
    }
    for (const item of items) {
      item.y += speed * dt
      item.angle += item.spin * dt
      const inBasket =
        item.y >= top - 10 &&
        item.y <= top + 20 &&
        Math.abs(item.x - basket.x) < basket.w / 2 + 6
      if (inBasket) {
        item.done = true
        if (item.kind === 'stone') {
          lives -= 1
          beep(150, 0.3)
        } else {
          score += item.kind === 'gold' ? 5 : 1
          onScore(score)
          beep(item.kind === 'gold' ? 880 : 620, 0.08)
        }
      }
      if (item.y > h + 30) item.done = true
    }
    items = items.filter(item => !item.done)

    ctx.fillStyle = '#E7F1FF'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = GRASS
    ctx.fillRect(0, top + basket.h - 6, w, h)
    for (const item of items) {
      if (item.kind === 'stone') drawStone(item.x, item.y, 14)
      else
        drawCarrot(ctx, item.x, item.y, 34, {
          angle: item.angle,
          gold: item.kind === 'gold',
        })
    }
    ctx.fillStyle = '#C98A4B'
    ctx.strokeStyle = '#7A4E22'
    ctx.lineWidth = 3
    roundRect(ctx, basket.x - basket.w / 2, top, basket.w, basket.h, 10)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    for (let i = 1; i < 4; i++) {
      const x = basket.x - basket.w / 2 + (basket.w * i) / 4
      ctx.moveTo(x, top + 4)
      ctx.lineTo(x, top + basket.h - 4)
    }
    ctx.stroke()
    for (let i = 0; i < 3; i++) drawHeart(w - 22 - i * 26, 24, 11, i < lives)
    if (lives <= 0) {
      onEnd(score)
      return false
    }
  })

  return {
    stop: () => {
      stop()
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', move)
      window.removeEventListener('keydown', key)
    },
  }
}
