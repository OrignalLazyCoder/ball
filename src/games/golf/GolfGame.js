import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { BaseGame } from '../../engine/BaseGame.js'
import { makeBottle, makeCone, makeBallBucket } from '../common/Props.js'

const HALF_L = 60, HALF_W = 35

const BUNKERS = [
  { x:  20, z:  10, r: 4 },
  { x: -28, z: -15, r: 5 },
  { x:  -5, z:  18, r: 3 },
]

const WATERS = [
  { x:  35, z:  -8, r: 6 },
  { x: -10, z: -22, r: 5 },
]

export class GolfGame extends BaseGame {
  static id = 'golf'
  static label = '⛳ GOLF'

  engineConfig() {
    return {
      sky: 0xa8d8f0,
      fog: { color: 0xa8d8f0, near: 90, far: 250 },
      ambient: 0x445544,
      shadowExtent: 70,
    }
  }

  arenaBounds() { return { halfLength: HALF_L, halfWidth: HALF_W } }
  defaultWeapon() { return 'club' }
  initialEnemyCount() { return 3 }
  maxEnemies() { return 100 }
  spawnIntervalStart() { return 9 }

  ballSpec() {
    // Real golf ball: ~4.27cm dia, 45.9g — very dense, rolls hard
    return { radius: 0.0214, mass: 0.0459, restitution: 0.5, friction: 0.7 }
  }

  cameraConfig() {
    return { fov: 76, distance: 1.6, height: 0.7, lookHeight: 0.3, near: 0.003, minY: 0.06 }
  }

  configureBall() {
    const ball = this.engine.ball
    ball.setAppearance({
      color: 0xffffff,
      emissive: 0x666666,
      emissiveIntensity: 0.4,
      lightIntensity: 0.7,
    })
  }

  buildArena() {
    const scene = this.engine.scene, world = this.engine.world

    // Fairway
    const fairway = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_L * 2, HALF_W * 2),
      new THREE.MeshStandardMaterial({ color: 0x6abf4b, roughness: 1 })
    )
    fairway.rotation.x = -Math.PI / 2
    fairway.receiveShadow = true
    scene.add(fairway)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF_L, 0.05, HALF_W)
        .setTranslation(0, -0.05, 0).setFriction(0.85)
    )

    // Sand bunkers (visual)
    BUNKERS.forEach(({ x, z, r }) => {
      const sand = new THREE.Mesh(
        new THREE.CircleGeometry(r, 32),
        new THREE.MeshStandardMaterial({ color: 0xefd58c, roughness: 1 })
      )
      sand.rotation.x = -Math.PI / 2
      sand.position.set(x, 0.011, z)
      scene.add(sand)
    })

    // Water hazards
    WATERS.forEach(({ x, z, r }) => {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(r, 32),
        new THREE.MeshStandardMaterial({
          color: 0x2a6fa6, roughness: 0.2, metalness: 0.4,
          emissive: 0x103050, emissiveIntensity: 0.3,
        })
      )
      water.rotation.x = -Math.PI / 2
      water.position.set(x, 0.012, z)
      scene.add(water)
      // Slight ring of darker blue for depth
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.7, r, 32),
        new THREE.MeshBasicMaterial({ color: 0x143052, transparent: true, opacity: 0.4 })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(x, 0.013, z)
      scene.add(ring)
    })

    // Trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x593e1f })
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a3a })
    for (let i = 0; i < 16; i++) {
      const tx = (Math.random() - 0.5) * (HALF_L * 1.7)
      const tz = (Math.random() - 0.5) * (HALF_W * 1.7)
      if (Math.hypot(tx, tz) < 8) continue
      // Avoid placing in hazards
      let inHazard = false
      for (const h of [...BUNKERS, ...WATERS]) {
        if (Math.hypot(tx - h.x, tz - h.z) < h.r + 1) { inHazard = true; break }
      }
      if (inHazard) continue
      addTree(scene, world, tx, tz, trunkMat, leafMat)
    }

    // Flag pin
    const flagBase = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    )
    flagBase.rotation.x = -Math.PI / 2; flagBase.position.set(40, 0.013, 22); scene.add(flagBase)
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee })
    )
    stick.position.set(40, 1.2, 22); scene.add(stick)
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff3030, side: THREE.DoubleSide })
    )
    flag.position.set(40.32, 2.05, 22); scene.add(flag)

    // Boundary colliders (invisible)
    const bw = 4
    const wall = (sx, sz, x, z) => world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx, bw / 2, sz).setTranslation(x, bw / 2, z).setRestitution(0.3)
    )
    wall(HALF_L, 0.2, 0,  HALF_W); wall(HALF_L, 0.2, 0, -HALF_W)
    wall(0.2, HALF_W,  HALF_L, 0); wall(0.2, HALF_W, -HALF_L, 0)

    // Bucket of practice balls near tee + water bottles + cones marking
    // hazards (so the player has visual cues at ground level)
    this.dynamicProps.push(makeBallBucket(scene, world, { x: -3, z: 0, ballColor: 0xffffff }))
    this.dynamicProps.push(makeBallBucket(scene, world, { x:  3, z: 0, ballColor: 0xffffff }))
    for (let i = -2; i <= 2; i++) {
      this.dynamicProps.push(makeBottle(scene, world, { x: i * 1.0 - 6, z: 1.2, color: 0x66ccff }))
    }
    // A few cones around the bunkers as hazard markers
    for (const b of BUNKERS) {
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2
        this.dynamicProps.push(makeCone(scene, world, {
          x: b.x + Math.cos(ang) * (b.r + 0.6),
          z: b.z + Math.sin(ang) * (b.r + 0.6),
        }))
      }
    }

    // Moving golf carts (kinematic, solid, with drivers)
    this.carts = [
      new GolfCart(scene, world, { center: { x:  18, z: -4 }, radius: 8,  speed: 2.5, color: 0xf5f5f5, hue: 0xff5577 }),
      new GolfCart(scene, world, { center: { x: -22, z:  8 }, radius: 10, speed: 2.0, color: 0xfde047, hue: 0x3366ff }),
      new GolfCart(scene, world, { center: { x:  -2, z: -20 },radius: 6,  speed: 3.0, color: 0xc2410c, hue: 0xa3e635 }),
    ]
  }

  _extraStep(dt) {
    // Update moving carts
    if (this.carts) for (const c of this.carts) c.update(dt)

    // Terrain effects on the ball
    const ball = this.engine.ball
    if (!ball.grounded) return
    const p = ball.position()

    // Water hazards: ball in water → respawn + lose 1 life
    for (const w of WATERS) {
      if (Math.hypot(p.x - w.x, p.z - w.z) < w.r) {
        this._waterHazard(w)
        return
      }
    }

    // Sand bunkers: heavy damping (ball quickly slows to a stop)
    let inSand = false
    for (const b of BUNKERS) {
      if (Math.hypot(p.x - b.x, p.z - b.z) < b.r) { inSand = true; break }
    }
    if (inSand) {
      const v = ball.velocity()
      const m = ball.body.mass()
      const drag = 6.0  // sand drag coefficient
      ball.body.applyImpulse(
        { x: -v.x * drag * dt * m, y: 0, z: -v.z * drag * dt * m },
        true
      )
    }
  }

  _waterHazard(water) {
    // Penalty: -1 life and respawn at center
    if (this.invulnTimer <= 0) this._takeHit()
    this.engine.ball.resetTo(0, 0)
    // Splash flash
    this._screenFlash('rgba(60, 140, 220, 0.5)')
    this.audio?.sfx.shockwave()
  }

  dispose() {
    if (this.carts) for (const c of this.carts) c.dispose()
    this.carts = []
    super.dispose()
  }
}

function addTree(scene, world, x, z, trunkMat, leafMat) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.5, 8), trunkMat)
  trunk.position.set(x, 1.25, z); trunk.castShadow = true; scene.add(trunk)
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 12), leafMat)
  leaves.position.set(x, 3.7, z); leaves.castShadow = true; scene.add(leaves)
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(1.25, 0.35).setTranslation(x, 1.25, z).setRestitution(0.3)
  )
}

/**
 * Realistic-size golf cart: ~2.4m long × 1.2m wide × 1.7m tall, with a seated
 * driver, four wheels, roof, club bag. Drives on a circular path; collider
 * is solid so the ball physically bounces off.
 */
class GolfCart {
  constructor(scene, world, { center, radius, speed, color = 0xf5f5f5, hue = 0xff5577 }) {
    this.scene = scene
    this.world = world
    this.center = center
    this.radius = radius
    this.speed = speed
    this.t = Math.random() * Math.PI * 2

    // Visual rig — realistic proportions
    this.root = new THREE.Group()

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.85 })

    // Lower chassis (2.2m × 0.5m × 1.1m)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 1.1), bodyMat)
    chassis.position.y = 0.42
    chassis.castShadow = true
    this.root.add(chassis)

    // Front bonnet sloped block
    const bonnet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.05), bodyMat)
    bonnet.position.set(0.85, 0.78, 0)
    bonnet.castShadow = true
    this.root.add(bonnet)

    // Windshield
    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0xaad4ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
        roughness: 0.1, metalness: 0.2,
      })
    )
    windshield.position.set(0.5, 1.1, 0)
    windshield.rotation.y = Math.PI / 2
    windshield.rotation.x = -0.25
    this.root.add(windshield)

    // Seat back
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 1.0), seatMat)
    seatBack.position.set(-0.65, 0.95, 0)
    this.root.add(seatBack)
    // Seat cushion
    const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.0), seatMat)
    seatCushion.position.set(-0.4, 0.7, 0)
    this.root.add(seatCushion)

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.2), darkMat)
    roof.position.set(-0.1, 1.65, 0)
    roof.castShadow = true
    this.root.add(roof)
    // Roof posts
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6)
    ;[[0.55, 0.55], [0.55, -0.55], [-0.65, 0.55], [-0.65, -0.55]].forEach(([dx, dz]) => {
      const p = new THREE.Mesh(postGeo, darkMat)
      p.position.set(dx, 1.12, dz)
      this.root.add(p)
    })

    // Wheels (4)
    this.wheels = []
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
    ;[[0.75, 0.55], [0.75, -0.55], [-0.7, 0.55], [-0.7, -0.55]].forEach(([dx, dz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat)
      w.rotation.z = Math.PI / 2
      w.position.set(dx, 0.32, dz)
      w.castShadow = true
      this.root.add(w)
      this.wheels.push(w)
    })

    // Steering wheel
    const steer = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.02, 6, 18),
      darkMat
    )
    steer.rotation.x = -0.3
    steer.position.set(0.35, 1.05, -0.25)
    this.root.add(steer)

    // Club bag at the back
    const bag = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 1.0, 12),
      new THREE.MeshStandardMaterial({ color: hue })
    )
    bag.rotation.z = -0.25
    bag.position.set(-1.1, 1.0, 0)
    this.root.add(bag)
    // Club handles poking out
    for (let i = 0; i < 4; i++) {
      const h = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8 })
      )
      h.position.set(-1.1 + (i - 1.5) * 0.04, 1.55, 0.04 * (i - 1.5))
      h.rotation.z = -0.25
      this.root.add(h)
    }

    // Driver figure (sitting)
    addDriver(this.root, hue)

    scene.add(this.root)

    // Kinematic body with a solid box collider (footprint of the cart)
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    this.body = world.createRigidBody(desc)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.15, 0.7, 0.6)
        .setTranslation(0, 0.7, 0).setRestitution(0.3).setFriction(0.4),
      this.body
    )

    this._tick(0)
  }

  _tick(dt) {
    this.t += dt * (this.speed / Math.max(0.5, this.radius))
    const x = this.center.x + Math.cos(this.t) * this.radius
    const z = this.center.z + Math.sin(this.t) * this.radius
    const yaw = this.t + Math.PI / 2  // tangent to the circle
    this.body.setNextKinematicTranslation({ x, y: 0, z })
    this.body.setNextKinematicRotation({
      x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2),
    })
    this.root.position.set(x, 0, z)
    this.root.rotation.y = yaw
    // Wheel spin
    const spin = dt * (this.speed / 0.32) * 1.2
    for (const w of this.wheels) w.rotation.x += spin
  }

  update(dt) { this._tick(dt) }

  dispose() {
    this.scene.remove(this.root)
    if (this.body) this.world.removeRigidBody(this.body)
    this.root.traverse(o => {
      o.geometry?.dispose?.()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach(m => m?.dispose?.())
    })
  }
}

function addDriver(parent, shirtColor) {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf3c8a0 })
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.85 })
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x202020 })

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 6), shirtMat)
  torso.position.set(-0.35, 1.05, 0)
  torso.castShadow = true
  parent.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), skinMat)
  head.position.set(-0.4, 1.4, 0)
  head.castShadow = true
  parent.add(head)
  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.04, 14),
    hatMat
  )
  visor.position.set(-0.4, 1.5, 0)
  parent.add(visor)
  // Arms holding the wheel
  const armMat = new THREE.MeshStandardMaterial({ color: 0xf3c8a0 })
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.35, 3, 6)
  const lArm = new THREE.Mesh(armGeo, armMat)
  lArm.position.set(0, 1.05, 0.2)
  lArm.rotation.z = -0.4
  parent.add(lArm)
  const rArm = new THREE.Mesh(armGeo, armMat)
  rArm.position.set(0, 1.05, -0.2)
  rArm.rotation.z = -0.4
  parent.add(rArm)
}
