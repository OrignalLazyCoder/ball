import * as THREE from 'three'

/**
 * Manages active effects on the ball (fire, long jump, speed, shield) and
 * the visual auras for each. Stat overrides are reapplied each frame so
 * they reset cleanly when an effect expires.
 */
export class Effects {
  constructor(ball) {
    this.ball = ball
    this.active = new Map()  // typeId → { until, ... }

    this._buildVisuals()
    this._captureBaseStats()
  }

  _captureBaseStats() {
    this.base = {
      maxSpeed: this.ball.maxSpeed,
      sprintMaxSpeed: this.ball.sprintMaxSpeed,
      acceleration: this.ball.acceleration,
      sprintAcceleration: this.ball.sprintAcceleration,
      jumpImpulse: this.ball.jumpImpulse,
    }
  }

  _buildVisuals() {
    // Fire shell — big additive sphere around the ball
    this.fireShell = new THREE.Mesh(
      new THREE.SphereGeometry(this.ball.radius * 1.6, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff5522,
        transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    )
    this.fireShell.visible = false
    this.ball.mesh.add(this.fireShell)

    // Fire light
    this.fireLight = new THREE.PointLight(0xff6622, 0, 6)
    this.ball.mesh.add(this.fireLight)

    // Shield ring (torus)
    this.shieldRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.ball.radius * 1.5, 0.05, 12, 32),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    )
    this.shieldRing.visible = false
    this.ball.mesh.add(this.shieldRing)

    // Speed glow
    this.speedShell = new THREE.Mesh(
      new THREE.SphereGeometry(this.ball.radius * 1.35, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0xfde047, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    )
    this.speedShell.visible = false
    this.ball.mesh.add(this.speedShell)

    // Long-jump glow (greenish, only flashes when jumping but always tinted)
    this.longJumpShell = new THREE.Mesh(
      new THREE.SphereGeometry(this.ball.radius * 1.25, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0x6ee7b7, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    )
    this.longJumpShell.visible = false
    this.ball.mesh.add(this.longJumpShell)
  }

  add(typeId, durationSec) {
    if (durationSec > 0) {
      this.active.set(typeId, { until: performance.now() + durationSec * 1000, duration: durationSec })
    } else {
      // Persistent until consumed
      this.active.set(typeId, { until: Infinity, duration: 0 })
    }
  }

  has(typeId) {
    const e = this.active.get(typeId)
    if (!e) return false
    if (e.until <= performance.now()) {
      this.active.delete(typeId)
      return false
    }
    return true
  }

  consume(typeId) {
    if (!this.has(typeId)) return false
    this.active.delete(typeId)
    return true
  }

  // Returns list of active effects with progress 0..1 (or null for one-shot)
  list() {
    const now = performance.now()
    const out = []
    for (const [id, e] of this.active) {
      if (e.until <= now) { this.active.delete(id); continue }
      out.push({
        id,
        progress: e.duration > 0 ? Math.max(0, (e.until - now) / 1000 / e.duration) : null,
        remaining: e.until - now,
      })
    }
    return out
  }

  update(dt) {
    // Apply stat mods based on active effects
    const sp = this.has('speed')
    const lj = this.has('long_jump')
    this.ball.maxSpeed         = sp ? this.base.maxSpeed * 1.7 : this.base.maxSpeed
    this.ball.sprintMaxSpeed   = sp ? this.base.sprintMaxSpeed * 1.7 : this.base.sprintMaxSpeed
    this.ball.acceleration     = sp ? this.base.acceleration * 1.5 : this.base.acceleration
    this.ball.sprintAcceleration = sp ? this.base.sprintAcceleration * 1.5 : this.base.sprintAcceleration
    this.ball.jumpImpulse      = lj ? this.base.jumpImpulse * 2.4 : this.base.jumpImpulse

    // Visuals
    const fire = this.has('fire')
    this.fireShell.visible = fire
    if (fire) {
      const t = performance.now() * 0.01
      const s = 1 + Math.sin(t) * 0.08
      this.fireShell.scale.setScalar(s)
      this.fireShell.material.opacity = 0.45 + Math.random() * 0.15
      this.fireLight.intensity = 1.5 + Math.sin(t * 2) * 0.4
    } else {
      this.fireLight.intensity = 0
    }

    this.shieldRing.visible = this.has('shield')
    if (this.shieldRing.visible) {
      this.shieldRing.rotation.x += dt * 1.5
      this.shieldRing.rotation.y += dt * 1.0
    }

    this.speedShell.visible = sp
    if (sp) this.speedShell.material.opacity = 0.18 + Math.random() * 0.18

    this.longJumpShell.visible = lj
  }

  dispose() {
    [this.fireShell, this.shieldRing, this.speedShell, this.longJumpShell].forEach(m => {
      if (!m) return
      m.parent?.remove(m)
      m.geometry?.dispose?.()
      m.material?.dispose?.()
    })
    this.fireLight?.parent?.remove(this.fireLight)
  }
}
