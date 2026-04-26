import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

// Default radius if no spec passed (matches a soccer football).
export const DEFAULT_BALL_RADIUS = 0.11
export const DEFAULT_BALL_MASS = 0.43

export class Ball {
  constructor(world, scene, opts = {}) {
    this.world = world
    this.radius = opts.radius ?? DEFAULT_BALL_RADIUS
    this.mass = opts.mass ?? DEFAULT_BALL_MASS

    // Density chosen so the rigid body's resulting mass = this.mass.
    const volume = (4 / 3) * Math.PI * this.radius ** 3
    const density = this.mass / volume

    // Visual
    const tex = makeFootballTexture()
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.55, metalness: 0.0,
      emissive: 0x222222, emissiveIntensity: 0.15,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 48, 48), mat)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    scene.add(this.mesh)

    // Attached point light scales with ball — so even a tiny golf ball stays
    // visible against ground textures.
    this.attachedLight = new THREE.PointLight(
      0xffffff, 0.6, Math.max(2, this.radius * 30)
    )
    this.mesh.add(this.attachedLight)

    // Physics. Damping kept low so motion feels natural; sport games can
    // ramp damping situationally (e.g. golf sand).
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, this.radius + 0.1, 0)
      .setLinearDamping(opts.linearDamping ?? 0.18)
      .setAngularDamping(opts.angularDamping ?? 0.08)
      .setCcdEnabled(true)
    this.body = world.createRigidBody(desc)

    const colDesc = RAPIER.ColliderDesc.ball(this.radius)
      .setRestitution(opts.restitution ?? 0.5)
      .setFriction(opts.friction ?? 1.0)
      .setDensity(density)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(2.0)
    this.collider = world.createCollider(colDesc, this.body)

    // Movement tuning. Real-world ball-control speeds (m/s).
    this.maxSpeed = opts.maxSpeed ?? 8
    this.sprintMaxSpeed = opts.sprintMaxSpeed ?? 13
    this.acceleration = opts.acceleration ?? 38
    this.sprintAcceleration = opts.sprintAcceleration ?? 56
    this.jumpImpulse = opts.jumpImpulse ?? 5
    this.brakingFactor = 6
    this.reverseBoost = 2.0

    this.stamina = 1.0
    this.staminaRegen = 0.12
    this.staminaDrain = 0.45

    this.grounded = false
    this._airborneFor = 0
    this._groundEpsilon = this.radius + 0.08
    this.groundY = 0   // set via setGroundY for raised play surfaces (TT)
  }

  setGroundY(y) { this.groundY = y }

  position() { return this.body.translation() }
  velocity() { return this.body.linvel() }
  speed() {
    const v = this.body.linvel()
    return Math.sqrt(v.x * v.x + v.z * v.z)
  }

  syncMesh() {
    const t = this.body.translation()
    const r = this.body.rotation()
    this.mesh.position.set(t.x, t.y, t.z)
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w)
  }

  applyControl(dt, forward, right, fwd, strafe, sprinting, jumpPressed) {
    const moving = (fwd !== 0 || strafe !== 0)
    const useSprint = sprinting && moving && this.stamina > 0.05

    if (useSprint) this.stamina = Math.max(0, this.stamina - this.staminaDrain * dt)
    else           this.stamina = Math.min(1, this.stamina + this.staminaRegen * dt)

    const accel = useSprint ? this.sprintAcceleration : this.acceleration
    const cap = useSprint ? this.sprintMaxSpeed : this.maxSpeed

    const m = this.body.mass()
    const v = this.body.linvel()

    if (moving && this.grounded) {
      const dirX = forward.x * fwd + right.x * strafe
      const dirZ = forward.z * fwd + right.z * strafe
      const dl = Math.hypot(dirX, dirZ) || 1
      const nx = dirX / dl
      const nz = dirZ / dl

      const desiredVx = nx * cap
      const desiredVz = nz * cap
      const dvx = desiredVx - v.x
      const dvz = desiredVz - v.z

      const horizSpeed = Math.hypot(v.x, v.z)
      let responsiveness = 1
      if (horizSpeed > 0.5) {
        const dot = (v.x * nx + v.z * nz) / horizSpeed
        responsiveness = 1 + Math.max(0, -dot) * (this.reverseBoost - 1)
      }

      const maxImpulse = accel * m * dt * responsiveness
      const dvLen = Math.hypot(dvx, dvz)
      if (dvLen > 0.0001) {
        const need = m * dvLen
        const k = need <= maxImpulse ? 1 : maxImpulse / need
        this.body.applyImpulse(
          { x: dvx * k * m, y: 0, z: dvz * k * m },
          true
        )
      }
    } else if (this.grounded && !moving) {
      const horizSpeed = Math.hypot(v.x, v.z)
      if (horizSpeed > 0.05) {
        const brake = Math.min(this.brakingFactor * dt, 1)
        this.body.applyImpulse(
          { x: -v.x * brake * m, y: 0, z: -v.z * brake * m },
          true
        )
      }
    }

    // Angular velocity cap based on rolling-without-slip omega = v / r
    const w = this.body.angvel()
    const vNow = this.body.linvel()
    const horizSpeedNow = Math.hypot(vNow.x, vNow.z)
    const maxOmega = (horizSpeedNow / this.radius) * 1.4 + 4
    const wMag = Math.hypot(w.x, w.y, w.z)
    if (wMag > maxOmega) {
      const k = maxOmega / wMag
      this.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true)
    }

    if (jumpPressed && this.grounded) {
      this.body.applyImpulse({ x: 0, y: this.jumpImpulse * m, z: 0 }, true)
      this.grounded = false
      this._didJump = true
    }
  }

  updateGrounded() {
    const p = this.body.translation()
    const v = this.body.linvel()
    const wasGrounded = this.grounded
    this.grounded = (p.y - this.groundY < this._groundEpsilon) && Math.abs(v.y) < 1.5
    if (!wasGrounded && this.grounded && this._airborneFor > 0.18) {
      this._justLandedThisStep = true
      this._lastLandSpeed = Math.abs(v.y) + Math.hypot(v.x, v.z) * 0.3
    } else {
      this._justLandedThisStep = false
    }
    this._airborneFor = this.grounded ? 0 : this._airborneFor + (1 / 60)
  }

  /** Reposition the ball with a hard reset (used on water hazards etc.). */
  resetTo(x, z) {
    this.body.setTranslation({ x, y: this.radius + 0.5, z }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  consumeJumped() {
    if (this._didJump) { this._didJump = false; return true }
    return false
  }
  consumeLanded() {
    if (this._justLandedThisStep) {
      this._justLandedThisStep = false
      return this._lastLandSpeed ?? 1
    }
    return 0
  }

  receiveKick(impulse) { this.body.applyImpulse(impulse, true) }

  setAppearance({
    color = 0xffffff, useFootballTexture = false,
    emissive = 0x222222, emissiveIntensity = 0.15,
    lightColor = 0xffffff, lightIntensity = 0.6,
  } = {}) {
    const old = this.mesh.material
    const map = useFootballTexture ? makeFootballTexture() : null
    this.mesh.material = new THREE.MeshStandardMaterial({
      color, map, roughness: 0.5, metalness: 0,
      emissive, emissiveIntensity,
    })
    old.map?.dispose?.()
    old.dispose?.()
    if (this.attachedLight) {
      this.attachedLight.color.setHex(lightColor)
      this.attachedLight.intensity = lightIntensity
    }
  }
}

// Re-export for backward compatibility (some callers used to import this).
export { DEFAULT_BALL_RADIUS as BALL_RADIUS }

function makeFootballTexture() {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f5f5f5'
  ctx.fillRect(0, 0, 1024, 512)
  ctx.fillStyle = '#1a1a1a'
  const placements = [
    [120, 110], [340, 90],  [560, 110], [780, 90],  [960, 110],
    [220, 250], [460, 250], [680, 250], [900, 250],
    [120, 400], [340, 420], [560, 400], [780, 420], [960, 400],
  ]
  placements.forEach(([x, y]) => drawPentagon(ctx, x, y, 36))
  return new THREE.CanvasTexture(c)
}

function drawPentagon(ctx, cx, cy, r) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2) / 5
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}
