import * as THREE from 'three'

const DEFAULT_BOUNDS = { halfLength: 40, halfWidth: 25 }

export const POWERUP = {
  FIRE:      { id: 'fire',      color: 0xff5522, label: '🔥 Fire',      duration: 8, weight: 4 },
  LONG_JUMP: { id: 'long_jump', color: 0x6ee7b7, label: '🦘 Long Jump', duration: 12, weight: 4 },
  SPEED:     { id: 'speed',     color: 0xfde047, label: '⚡ Speed',     duration: 8, weight: 4 },
  SHIELD:    { id: 'shield',    color: 0x67e8f9, label: '🛡️ Shield',   duration: 0, weight: 3 },  // one-shot
  SHOCKWAVE: { id: 'shockwave', color: 0xc084fc, label: '💥 Shockwave', duration: 0, weight: 2 }, // instant
  HEART:     { id: 'heart',     color: 0xff3366, label: '❤ Extra Life', duration: 0, weight: 2 }, // rare
}
export const POWERUP_TYPES = Object.values(POWERUP)

export class PowerUp {
  constructor(scene, type, position) {
    this.scene = scene
    this.type = type
    this.position = position
    this.collected = false
    this.spawnTime = performance.now()

    this.root = new THREE.Group()

    const isHeart = type.id === 'heart'
    const geo = isHeart ? buildHeartGeometry() : new THREE.OctahedronGeometry(0.45, 0)
    const crystal = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: type.color,
        emissive: type.color,
        emissiveIntensity: isHeart ? 1.0 : 0.7,
        metalness: 0.3,
        roughness: 0.2,
      })
    )
    crystal.castShadow = true
    if (isHeart) crystal.scale.set(0.85, 0.85, 0.85)
    this.crystal = crystal
    this.isHeart = isHeart
    this.root.add(crystal)

    // Light beam under it (a thin cone)
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 1.5, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: type.color, transparent: true, opacity: 0.18,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    )
    beam.position.y = -0.6
    this.root.add(beam)

    // Point light for glow
    const light = new THREE.PointLight(type.color, 1.0, 6)
    light.position.y = 0
    this.root.add(light)

    this.root.position.set(position.x, 1.4, position.z)
    scene.add(this.root)
  }

  update(dt) {
    if (this.collected) return
    const t = (performance.now() - this.spawnTime) / 1000
    this.crystal.rotation.y = t * 1.6
    if (this.isHeart) {
      // Heart "beat" pulse instead of tumble
      const beat = 1 + Math.sin(t * 6) * 0.08 + Math.sin(t * 12) * 0.04
      this.crystal.scale.setScalar(0.85 * beat)
      this.crystal.rotation.x = 0
    } else {
      this.crystal.rotation.x = Math.sin(t * 1.2) * 0.2
    }
    // Bob
    this.root.position.y = 1.4 + Math.sin(t * 2) * 0.18
  }

  // Distance from a position (XZ)
  distanceTo(pos) {
    const dx = this.root.position.x - pos.x
    const dz = this.root.position.z - pos.z
    return Math.hypot(dx, dz)
  }

  collect() {
    this.collected = true
  }

  dispose() {
    this.scene.remove(this.root)
    this.root.traverse(o => {
      o.geometry?.dispose?.()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach(m => m?.dispose?.())
    })
  }
}

export class PowerUpManager {
  constructor(scene, opts = {}) {
    this.scene = scene
    this.items = []
    this.spawnInterval = opts.spawnInterval ?? 9   // seconds
    this.maxActive = opts.maxActive ?? 3
    this.spawnTimer = this.spawnInterval * 0.4     // first spawn comes quickly
    this.canSpawnHeart = opts.canSpawnHeart ?? (() => true)
    this.bounds = opts.bounds ?? DEFAULT_BOUNDS
  }

  update(dt) {
    this.spawnTimer += dt
    if (this.spawnTimer >= this.spawnInterval && this.items.length < this.maxActive) {
      this.spawnTimer = 0
      this._spawnRandom()
    }
    for (const p of this.items) p.update(dt)
  }

  spawnHeart() {
    // Manually spawn a heart at a random position (used by Game when player
    // takes a hit so help can arrive when it matters most)
    if (this.items.length >= this.maxActive + 1) return
    const pos = {
      x: (Math.random() - 0.5) * (this.bounds.halfLength * 1.4),
      z: (Math.random() - 0.5) * (this.bounds.halfWidth * 1.4),
    }
    this.items.push(new PowerUp(this.scene, POWERUP.HEART, pos))
  }

  _spawnRandom() {
    const allowHeart = this.canSpawnHeart()
    const pool = allowHeart ? POWERUP_TYPES : POWERUP_TYPES.filter(t => t.id !== 'heart')
    // Weighted pick
    const totalW = pool.reduce((s, t) => s + (t.weight || 1), 0)
    let r = Math.random() * totalW
    let type = pool[0]
    for (const t of pool) {
      r -= (t.weight || 1)
      if (r <= 0) { type = t; break }
    }
    const pos = {
      x: (Math.random() - 0.5) * (this.bounds.halfLength * 1.6),
      z: (Math.random() - 0.5) * (this.bounds.halfWidth * 1.6),
    }
    this.items.push(new PowerUp(this.scene, type, pos))
  }

  // Returns the first uncollected powerup within `radius` of `pos`, or null
  pickupAt(pos, radius) {
    for (const p of this.items) {
      if (p.collected) continue
      if (p.distanceTo(pos) < radius) return p
    }
    return null
  }

  remove(p) {
    p.dispose()
    this.items = this.items.filter(x => x !== p)
  }

  dispose() {
    for (const p of this.items) p.dispose()
    this.items = []
  }
}

function buildHeartGeometry() {
  const shape = new THREE.Shape()
  // Classic heart curve, centered at origin in XY plane
  shape.moveTo(0, 0.3)
  shape.bezierCurveTo(0,    0.55, -0.45, 0.55, -0.45, 0.15)
  shape.bezierCurveTo(-0.45,-0.20,  0,   -0.30,  0,   -0.55)
  shape.bezierCurveTo( 0,   -0.30,  0.45,-0.20,  0.45, 0.15)
  shape.bezierCurveTo( 0.45, 0.55,  0,    0.55,  0,    0.3)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.18, bevelEnabled: true, bevelSize: 0.05,
    bevelThickness: 0.03, bevelSegments: 2, curveSegments: 16,
  })
  geo.center()
  // Flip so the point faces down when standing upright
  geo.rotateZ(Math.PI)
  return geo
}
