import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

const STATE = {
  CHASING:    'chasing',
  WIND_UP:    'wind_up',
  KICK:       'kick',
  RECOVER:    'recover',
  ELIMINATED: 'eliminated',
}

const ROLE = {
  PURSUER:     'pursuer',
  FLANKER:     'flanker',
  INTERCEPTOR: 'interceptor',
  AMBUSHER:    'ambusher',
}

let kickerCounter = 0

const DEFAULT_BOUNDS = { halfLength: 40, halfWidth: 25 }

export class Kicker {
  constructor(scene, world, options = {}) {
    this.id = ++kickerCounter
    this.world = world
    this.speed = options.speed ?? 3.6
    this.kickRange = options.kickRange ?? 1.7
    this.windupTime = options.windupTime ?? 0.45
    this.recoverTime = options.recoverTime ?? 0.7
    this.kickPower = options.kickPower ?? 14
    this.color = options.color ?? 0xc0392b
    this.role = options.role ?? pickRole()
    this.weapon = options.weapon ?? 'foot'   // 'foot' | 'bat' | 'racket' | 'club' | 'paddle'
    this.bounds = options.bounds ?? DEFAULT_BOUNDS

    // Jump-dodge: if the ball is above this height when the kick lands, it
    // sails harmlessly under and the player has dodged the swing.
    this.kickReachY = options.kickReachY ?? 1.4

    this.approachAngle = options.approachAngle ?? Math.random() * Math.PI * 2
    this.angularDrift = (Math.random() - 0.5) * 0.6
    this.approachDistance = this.kickRange * 0.85
    this.flankSide = Math.random() < 0.5 ? 1 : -1
    this.flankDistance = 4.5 + Math.random() * 2
    this.predictTime = 1.0 + Math.random() * 0.8
    this.patrolPoint = options.patrolPoint ?? randomPatrolPoint(this.bounds)
    this.patrolJitter = Math.random() * Math.PI * 2

    this.separationRadius = 3.6
    this.separationStrength = 1.8
    this.kickCooldown = 0
    this.killed = false

    // Visual rig
    this.root = new THREE.Group()
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xf3c8a0, roughness: 0.7 })
    this.shirtMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.85 })
    this.shortsMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), this.shirtMat)
    torso.position.y = 1.1; torso.castShadow = true; this.root.add(torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), this.skinMat)
    head.position.y = 1.75; head.castShadow = true; this.root.add(head)

    // Legs
    this.leftLeg = new THREE.Group()
    this.rightLeg = new THREE.Group()
    this.leftLeg.position.set(-0.14, 0.7, 0)
    this.rightLeg.position.set(0.14, 0.7, 0)
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8)
    const lmesh = new THREE.Mesh(legGeo, this.shortsMat); lmesh.position.y = -0.35; lmesh.castShadow = true
    const rmesh = new THREE.Mesh(legGeo, this.shortsMat); rmesh.position.y = -0.35; rmesh.castShadow = true
    this.leftLeg.add(lmesh)
    this.rightLeg.add(rmesh)
    this.root.add(this.leftLeg)
    this.root.add(this.rightLeg)

    if (this.weapon === 'foot') {
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.1, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 })
      )
      boot.position.set(0, -0.7, 0.06); boot.castShadow = true
      this.rightLeg.add(boot)
    }

    // Arms (used to swing weapons). Pivot at shoulder, weapon hangs from "hand".
    this.rightArm = new THREE.Group()
    this.rightArm.position.set(0.42, 1.45, 0)
    const armGeo = new THREE.CapsuleGeometry(0.09, 0.55, 4, 8)
    const armMesh = new THREE.Mesh(armGeo, this.shirtMat)
    armMesh.position.y = -0.3; armMesh.castShadow = true
    this.rightArm.add(armMesh)
    this.root.add(this.rightArm)

    this.leftArm = new THREE.Group()
    this.leftArm.position.set(-0.42, 1.45, 0)
    const lArmMesh = new THREE.Mesh(armGeo, this.shirtMat)
    lArmMesh.position.y = -0.3; lArmMesh.castShadow = true
    this.leftArm.add(lArmMesh)
    this.root.add(this.leftArm)

    if (this.weapon !== 'foot') {
      const w = makeWeapon(this.weapon)
      w.position.y = -0.65
      // Tip points outward (forward when arm rests by side)
      this.rightArm.add(w)
      this.weaponMesh = w
    }

    scene.add(this.root)
    this.kickerScene = scene

    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.0, 0)
    this.body = world.createRigidBody(desc)
    const colDesc = RAPIER.ColliderDesc.capsule(0.7, 0.32)
      .setTranslation(0, 0, 0).setFriction(0.4)
    this.collider = world.createCollider(colDesc, this.body)

    this.state = STATE.CHASING
    this.stateTime = 0
    this.spawn(options.spawnPos)
  }

  spawn(pos) {
    const p = pos ?? randomEdgePosition(this.bounds)
    this.body.setNextKinematicTranslation({ x: p.x, y: 1.0, z: p.z })
    this.root.position.set(p.x, 0, p.z)
    this.root.rotation.set(0, 0, 0)
    this.state = STATE.CHASING
    this.stateTime = 0
    this._kickFiredFor = null
  }

  _calcTarget(ballPos, ballVel) {
    const speed = Math.hypot(ballVel.x, ballVel.z)

    if (this.role === ROLE.FLANKER) {
      if (speed > 1.0) {
        const px = -ballVel.z / speed
        const pz =  ballVel.x / speed
        return {
          x: ballPos.x + px * this.flankDistance * this.flankSide,
          z: ballPos.z + pz * this.flankDistance * this.flankSide,
        }
      }
      return this._orbitTarget(ballPos)
    }

    if (this.role === ROLE.INTERCEPTOR) {
      return {
        x: ballPos.x + ballVel.x * this.predictTime * 0.7,
        z: ballPos.z + ballVel.z * this.predictTime * 0.7,
      }
    }

    if (this.role === ROLE.AMBUSHER) {
      const t = this.body.translation()
      const distToBall = Math.hypot(ballPos.x - t.x, ballPos.z - t.z)
      if (distToBall < 7) return { x: ballPos.x, z: ballPos.z }
      this.patrolJitter += 0.3
      return {
        x: this.patrolPoint.x + Math.cos(this.patrolJitter) * 1.5,
        z: this.patrolPoint.z + Math.sin(this.patrolJitter) * 1.5,
      }
    }

    return this._orbitTarget(ballPos)
  }

  _orbitTarget(ballPos) {
    return {
      x: ballPos.x + Math.cos(this.approachAngle) * this.approachDistance,
      z: ballPos.z + Math.sin(this.approachAngle) * this.approachDistance,
    }
  }

  _swingLimb() {
    // What body part visually performs the swing? Foot = leg, weapons = arm.
    return this.weapon === 'foot' ? this.rightLeg : this.rightArm
  }

  update(dt, ballPos, ballVel, ballBody, peers, onKick) {
    if (this.state === STATE.ELIMINATED) {
      this.stateTime += dt
      const k = Math.min(1, this.stateTime / 0.6)
      this.root.rotation.x = k * (Math.PI / 2)
      this.root.position.y = -k * 0.4
      return
    }

    this.stateTime += dt
    this.kickCooldown = Math.max(0, this.kickCooldown - dt)
    const t = this.body.translation()
    const walkPhase = performance.now() * 0.005 * this.speed
    const HL = this.bounds.halfLength
    const HW = this.bounds.halfWidth

    if (this.state === STATE.CHASING) {
      this.approachAngle += this.angularDrift * dt
      const distToBall = Math.hypot(ballPos.x - t.x, ballPos.z - t.z)
      const closeCommit = distToBall < this.kickRange + 1.4
      const target = closeCommit ? { x: ballPos.x, z: ballPos.z } : this._calcTarget(ballPos, ballVel)

      let dx = target.x - t.x
      let dz = target.z - t.z
      let len = Math.hypot(dx, dz) || 1
      let mx = dx / len
      let mz = dz / len

      let sepX = 0, sepZ = 0
      if (peers) {
        for (const o of peers) {
          if (o === this || o.state === STATE.ELIMINATED) continue
          const op = o.body.translation()
          const odx = t.x - op.x
          const odz = t.z - op.z
          const od = Math.hypot(odx, odz)
          if (od > 0.001 && od < this.separationRadius) {
            const w = (this.separationRadius - od) / this.separationRadius
            sepX += (odx / od) * w
            sepZ += (odz / od) * w
          }
        }
      }

      mx += sepX * this.separationStrength
      mz += sepZ * this.separationStrength
      const ml = Math.hypot(mx, mz) || 1
      mx /= ml
      mz /= ml

      const step = this.speed * dt
      const cx = clamp(t.x + mx * step, -HL + 1, HL - 1)
      const cz = clamp(t.z + mz * step, -HW + 1, HW - 1)
      this.body.setNextKinematicTranslation({ x: cx, y: 1.0, z: cz })
      this.root.position.set(cx, 0, cz)
      this.root.rotation.y = Math.atan2(ballPos.x - cx, ballPos.z - cz)

      this.leftLeg.rotation.x  =  Math.sin(walkPhase) * 0.5
      this.rightLeg.rotation.x = -Math.sin(walkPhase) * 0.5
      // Idle arm sway (only if not holding a weapon, otherwise weapon flails too much)
      if (this.weapon === 'foot') {
        this.rightArm.rotation.x = -Math.sin(walkPhase) * 0.3
        this.leftArm.rotation.x  =  Math.sin(walkPhase) * 0.3
      }

      if (this.kickCooldown <= 0 && distToBall < this.kickRange) {
        const peerThreatNearby = peers?.some(o =>
          o !== this && o.state !== STATE.ELIMINATED &&
          (o.state === STATE.WIND_UP || o.state === STATE.KICK) &&
          Math.hypot(o.body.translation().x - cx, o.body.translation().z - cz) < 3.0
        )
        if (!peerThreatNearby) {
          this.state = STATE.WIND_UP
          this.stateTime = 0
        }
      }
    } else if (this.state === STATE.WIND_UP) {
      const k = Math.min(1, this.stateTime / this.windupTime)
      const limb = this._swingLimb()
      limb.rotation.x = THREE.MathUtils.lerp(0, -1.4, k)
      if (this.weapon === 'foot') this.leftLeg.rotation.x = THREE.MathUtils.lerp(0, 0.2, k)
      this.root.rotation.y = Math.atan2(ballPos.x - t.x, ballPos.z - t.z)
      if (this.stateTime >= this.windupTime) {
        this.state = STATE.KICK
        this.stateTime = 0
      }
    } else if (this.state === STATE.KICK) {
      const k = Math.min(1, this.stateTime / 0.12)
      const limb = this._swingLimb()
      limb.rotation.x = THREE.MathUtils.lerp(-1.4, 0.9, k)

      if (!this._kickFiredFor) {
        this._kickFiredFor = true
        const dx = ballPos.x - t.x
        const dz = ballPos.z - t.z
        const d = Math.hypot(dx, dz)
        const inRange = d < this.kickRange + 0.6
        const ballAirborne = ballPos.y > this.kickReachY
        if (inRange && !ballAirborne) {
          const m = ballBody.mass()
          const dirx = dx / (d || 1)
          const dirz = dz / (d || 1)
          ballBody.applyImpulse({
            x: dirx * this.kickPower * m,
            y: 0.32 * this.kickPower * m,
            z: dirz * this.kickPower * m,
          }, true)
          onKick?.(this, true)
        } else {
          // Either out of range OR ball was jumped over — counts as a dodge
          onKick?.(this, false)
        }
      }
      if (this.stateTime >= 0.12) {
        this.state = STATE.RECOVER
        this.stateTime = 0
      }
    } else if (this.state === STATE.RECOVER) {
      const k = Math.min(1, this.stateTime / this.recoverTime)
      const limb = this._swingLimb()
      limb.rotation.x = THREE.MathUtils.lerp(0.9, 0, k)
      if (this.stateTime >= this.recoverTime) {
        this.state = STATE.CHASING
        this.stateTime = 0
        this._kickFiredFor = null
        this.approachAngle = Math.random() * Math.PI * 2
        this.kickCooldown = 0.6
      }
    }
  }

  isThreatening() { return this.state === STATE.WIND_UP || this.state === STATE.KICK }
  isAlive() { return this.state !== STATE.ELIMINATED }

  eliminate() {
    if (this.state === STATE.ELIMINATED) return
    this.state = STATE.ELIMINATED
    this.stateTime = 0
    this.killed = true
    this.shirtMat.color.set(0x222222)
    this.shirtMat.emissive?.set(0x331100)
  }

  position() { return this.body.translation() }

  dispose() {
    this.kickerScene.remove(this.root)
    if (this.body) this.world.removeRigidBody(this.body)
    this.root.traverse(o => {
      o.geometry?.dispose?.()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach(m => m?.dispose?.())
    })
  }
}

function pickRole() {
  const r = Math.random()
  if (r < 0.35) return ROLE.PURSUER
  if (r < 0.60) return ROLE.FLANKER
  if (r < 0.80) return ROLE.INTERCEPTOR
  return ROLE.AMBUSHER
}

function randomEdgePosition(bounds) {
  const ang = Math.random() * Math.PI * 2
  const r = bounds.halfWidth * 0.7 + Math.random() * bounds.halfWidth * 0.3
  return {
    x: clamp(Math.cos(ang) * r, -bounds.halfLength + 2, bounds.halfLength - 2),
    z: clamp(Math.sin(ang) * r * (bounds.halfWidth / bounds.halfLength), -bounds.halfWidth + 2, bounds.halfWidth - 2),
  }
}

function randomPatrolPoint(bounds) {
  const HL = bounds.halfLength, HW = bounds.halfWidth
  const choices = [
    { x:  HL - 6, z:  HW - 4 }, { x:  HL - 6, z: -HW + 4 },
    { x: -HL + 6, z:  HW - 4 }, { x: -HL + 6, z: -HW + 4 },
    { x:  HL * 0.3, z: 0 },     { x: -HL * 0.3, z: 0 },
    { x: 0, z:  HW * 0.6 },     { x: 0, z: -HW * 0.6 },
  ]
  return choices[Math.floor(Math.random() * choices.length)]
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }

function makeWeapon(kind) {
  switch (kind) {
    case 'bat': {
      // Cricket bat: blade + handle
      const g = new THREE.Group()
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.85, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xd9b88a, roughness: 0.6 })
      )
      blade.position.y = -0.42
      blade.castShadow = true
      g.add(blade)
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8),
        new THREE.MeshStandardMaterial({ color: 0x884422 })
      )
      handle.position.y = 0.05
      g.add(handle)
      return g
    }
    case 'racket': {
      const g = new THREE.Group()
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x202020 })
      )
      handle.position.y = -0.1
      g.add(handle)
      const head = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.02, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xff5577, metalness: 0.4, roughness: 0.3 })
      )
      head.position.y = -0.42
      head.rotation.x = Math.PI / 2
      g.add(head)
      const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
      const strings = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), stringMat)
      strings.position.y = -0.42
      strings.rotation.x = Math.PI / 2
      g.add(strings)
      return g
    }
    case 'club': {
      // Golf club: long shaft with angled head
      const g = new THREE.Group()
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 1.0, 8),
        new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.7, roughness: 0.4 })
      )
      shaft.position.y = -0.45
      g.add(shaft)
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 })
      )
      head.position.set(0.04, -0.95, 0.06)
      head.rotation.z = -0.2
      g.add(head)
      return g
    }
    case 'paddle': {
      const g = new THREE.Group()
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.18, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x884422 })
      )
      handle.position.y = -0.05
      g.add(handle)
      const blade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.025, 24),
        new THREE.MeshStandardMaterial({ color: 0xc0392b })
      )
      blade.rotation.x = Math.PI / 2
      blade.position.y = -0.28
      g.add(blade)
      return g
    }
    default:
      return new THREE.Group()
  }
}

export { STATE as KICKER_STATE, ROLE as KICKER_ROLE }
