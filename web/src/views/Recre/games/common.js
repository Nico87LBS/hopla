import { HOPLA } from '../../../constants/theme'

// What the little games of the récré share: a sharp canvas, a frame loop,
// the drawings of Hopla (rabbit, carrot) and short sounds.

export const PALETTE = [HOPLA.carrot, HOPLA.violet, HOPLA.green, HOPLA.gold]

export const GRASS = '#EAF6E3'
export const GRASS_DARK = '#D6EDCB'

// setupCanvas draws in CSS pixels on a canvas as sharp as the screen.
export const setupCanvas = canvas => {
  const dpr = window.devicePixelRatio || 1
  const { height, width } = canvas.getBoundingClientRect()
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, h: height, w: width }
}

// loop calls step(dt) at each frame until it answers false or is stopped.
export const loop = step => {
  let id = 0
  let last = performance.now()
  let running = true
  const tick = now => {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (step(dt) === false) {
      running = false
      return
    }
    id = requestAnimationFrame(tick)
  }
  id = requestAnimationFrame(tick)
  return () => {
    running = false
    cancelAnimationFrame(id)
  }
}

// pointer gives the place of a pointer event in the canvas.
export const pointer = (canvas, event) => {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

export const random = (min, max) => min + Math.random() * (max - min)
export const pick = list => list[Math.floor(Math.random() * list.length)]

export const drawCarrot = (
  ctx,
  x,
  y,
  size,
  { angle = 0, gold = false } = {},
) => {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = gold ? HOPLA.gold : HOPLA.carrot
  ctx.beginPath()
  ctx.moveTo(-size * 0.32, -size * 0.3)
  ctx.quadraticCurveTo(0, -size * 0.42, size * 0.32, -size * 0.3)
  ctx.lineTo(0, size * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = gold ? HOPLA.goldText : HOPLA.carrotText
  ctx.lineWidth = Math.max(1, size * 0.05)
  for (const k of [-0.05, 0.12]) {
    ctx.beginPath()
    ctx.moveTo(-size * 0.18, size * k)
    ctx.lineTo(-size * 0.05, size * (k + 0.02))
    ctx.stroke()
  }
  ctx.fillStyle = HOPLA.green
  for (const a of [-0.5, 0, 0.5]) {
    ctx.beginPath()
    ctx.ellipse(
      Math.sin(a) * size * 0.14,
      -size * 0.42,
      size * 0.07,
      size * 0.2,
      a,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.restore()
}

// drawRabbit draws a rabbit head looking toward angle (0 = right).
export const drawRabbit = (
  ctx,
  x,
  y,
  size,
  { angle = -Math.PI / 2, color = '#FFFFFF', ink = HOPLA.ink } = {},
) => {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle + Math.PI / 2)
  ctx.fillStyle = color
  ctx.strokeStyle = ink
  ctx.lineWidth = Math.max(1.5, size * 0.06)
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(
      side * size * 0.2,
      -size * 0.55,
      size * 0.13,
      size * 0.36,
      side * 0.18,
      0,
      Math.PI * 2,
    )
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#FFC7D6'
    ctx.beginPath()
    ctx.ellipse(
      side * size * 0.2,
      -size * 0.55,
      size * 0.06,
      size * 0.24,
      side * 0.18,
      0,
      Math.PI * 2,
    )
    ctx.fill()
    ctx.fillStyle = color
  }
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = ink
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(side * size * 0.15, -size * 0.06, size * 0.055, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#FF8FAB'
  ctx.beginPath()
  ctx.arc(0, size * 0.1, size * 0.06, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

let audio = null

// beep plays a short note; silent where the device has no sound.
export const beep = (freq, duration = 0.12, volume = 0.15) => {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)()
    if (audio.state === 'suspended') audio.resume()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + duration)
  } catch {
    // No sound: the game goes on.
  }
}
