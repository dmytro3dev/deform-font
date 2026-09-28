import { Vector3 } from 'three'

const SPRING = { stiffness: 140, damping: 8, maxStep: 1 / 30, angle: Math.PI * 0.5 }

const AUTOPLAY = { slot: 0.7 }

class TwistSprings {
  angles = new Float32Array(0)
  velocities = new Float32Array(0)
  enabled = true
  playing = false
  private playStart = 0
  private hover = new Map<string, { index: number; side: number }>()
  private last = 0

  resize(n: number) {
    if (n === this.angles.length) return
    this.angles = new Float32Array(n)
    this.velocities = new Float32Array(n)
  }

  setPlaying(playing: boolean) {
    if (playing && !this.playing) this.playStart = performance.now()
    this.playing = playing
  }

  private autoTarget(i: number, nowMs: number) {
    const n = this.angles.length
    const slot = Math.floor((nowMs - this.playStart) / 1000 / AUTOPLAY.slot)
    const cycle = Math.floor(slot / (n + 1))
    if (slot % (n + 1) !== i) return 0
    return (cycle % 2 === 0 ? 1 : -1) * SPRING.angle
  }

  setHover(column: string, index: number, side: number) {
    this.hover.set(column, { index, side })
  }

  step(nowMs: number) {
    if (nowMs <= this.last) return
    const dt = Math.min((nowMs - this.last) / 1000, SPRING.maxStep)
    this.last = nowMs
    for (let i = 0; i < this.angles.length; i++) {
      let target = 0
      if (this.playing) target = this.autoTarget(i, nowMs)
      else if (this.enabled) for (const h of this.hover.values()) if (h.index === i) target = h.side * SPRING.angle
      const accel = -SPRING.stiffness * (this.angles[i] - target) - SPRING.damping * this.velocities[i]
      this.velocities[i] += accel * dt
      this.angles[i] += this.velocities[i] * dt
    }
  }
}

export const springs = new TwistSprings()

export const camSync = { source: '', version: 0, position: new Vector3(), target: new Vector3() }
