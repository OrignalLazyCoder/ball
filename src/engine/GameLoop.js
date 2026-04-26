const PHYSICS_STEP = 1 / 60

export class GameLoop {
  constructor({ step, render, maxFrameDt = 0.1 }) {
    this.step = step
    this.render = render
    this.maxFrameDt = maxFrameDt
    this.accumulator = 0
    this.lastTime = 0
    this.running = false
  }

  start() {
    this.running = true
    this.lastTime = performance.now()
    requestAnimationFrame(this._tick)
  }

  stop() { this.running = false }

  _tick = (now) => {
    if (!this.running) return
    const dt = Math.min((now - this.lastTime) / 1000, this.maxFrameDt)
    this.lastTime = now
    this.accumulator += dt
    while (this.accumulator >= PHYSICS_STEP) {
      this.step?.(PHYSICS_STEP)
      this.accumulator -= PHYSICS_STEP
    }
    this.render?.(dt)
    requestAnimationFrame(this._tick)
  }
}
