import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { BaseGame, PALETTE } from '../../engine/BaseGame.js'
import { makeBottle, makeCone } from '../common/Props.js'

const HALF_L = 45, HALF_W = 32

// Pitch oriented along Z axis. Striker's stumps at +z, non-striker's at -z.
const STRIKER_Z = 10.5
const NON_STRIKER_Z = -10.5

// Crease (batting position) is in front of the stumps facing the bowler.
const STRIKER_BATSMAN     = { x:  0.2, z:  STRIKER_Z - 0.6 }
const NON_STRIKER_BATSMAN = { x:  0.2, z:  NON_STRIKER_Z + 0.6 }

// Standard fielding positions (right-handed batsman). Mix of close + ring.
const FIELDER_POSITIONS = [
  { x:  0,    z:  STRIKER_Z + 1.8 },   // wicket-keeper
  { x:  2.0,  z:  STRIKER_Z + 1.2 },   // first slip
  { x:  6,    z:  4 },                 // cover
  { x: -6,    z:  4 },                 // mid-on
  { x:  9,    z: -3 },                 // point
  { x: -9,    z: -2 },                 // square leg
  { x:  4,    z: NON_STRIKER_Z - 4 },  // long-off
]

const UMPIRE_POSITION = { x: 0.7, z: NON_STRIKER_Z - 1.6 }

export class CricketGame extends BaseGame {
  static id = 'cricket'
  static label = '🏏 CRICKET'

  arenaBounds() { return { halfLength: HALF_L, halfWidth: HALF_W } }
  defaultWeapon() { return 'foot' }

  initialEnemyCount() { return 9 }   // 2 batsmen + 7 fielders to start (umpire is decor)
  maxEnemies() { return 100 }
  spawnIntervalStart() { return 14 }
  spawnIntervalMin() { return 7 }

  ballSpec() {
    // Real cricket ball: ~7.2cm dia, 156g, low bounce on grass
    return { radius: 0.036, mass: 0.156, restitution: 0.4, friction: 0.9 }
  }

  cameraConfig() {
    return { fov: 75, distance: 1.8, height: 0.85, lookHeight: 0.4, near: 0.005, minY: 0.1 }
  }

  configureBall() {
    const ball = this.engine.ball
    ball.setAppearance({
      color: 0xaa1c1c,
      emissive: 0x440808,
      emissiveIntensity: 0.4,
      lightColor: 0xff5544,
      lightIntensity: 0.9,
    })
    ball.collider.setRestitution(0.45)
  }

  enemyConfig(timeAlive, idx) {
    const t = timeAlive ?? 0
    // 0 = striker batsman, 1 = non-striker batsman, 2..8 = fielders
    if (idx === 0 || idx === 1) {
      return {
        speed: 1.6,                    // batsmen barely move from the crease
        windupTime: 0.5,
        kickPower: 22,                 // bat hits hard
        weapon: 'bat',
        color: idx === 0 ? 0xeeeeee : 0xdcdcdc,
        approachAngle: Math.random() * Math.PI * 2,
        role: 'ambusher',
        patrolPoint: idx === 0 ? STRIKER_BATSMAN : NON_STRIKER_BATSMAN,
        kickRange: 1.9,
      }
    }
    return {
      speed: 3.4 + Math.min(2.2, t * 0.03),
      windupTime: Math.max(0.3, 0.55 - t * 0.005),
      kickPower: 11 + Math.min(5, t * 0.06),
      weapon: 'foot',
      color: PALETTE[(idx + Math.floor(Math.random() * 3)) % PALETTE.length],
      approachAngle: Math.random() * Math.PI * 2,
    }
  }

  enemySpawnPosition(idx) {
    if (idx === 0) return STRIKER_BATSMAN
    if (idx === 1) return NON_STRIKER_BATSMAN
    const fielderIdx = idx - 2
    return FIELDER_POSITIONS[fielderIdx % FIELDER_POSITIONS.length]
  }

  buildArena() {
    const scene = this.engine.scene, world = this.engine.world

    // Outfield
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_L * 2, HALF_W * 2),
      new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 1 })
    )
    grass.rotation.x = -Math.PI / 2
    grass.receiveShadow = true
    scene.add(grass)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF_L, 0.05, HALF_W)
        .setTranslation(0, -0.05, 0).setFriction(0.85)
    )

    // Pitch (lighter strip down the middle)
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 22),
      new THREE.MeshStandardMaterial({ color: 0xc2a070, roughness: 1 })
    )
    pitch.rotation.x = -Math.PI / 2
    pitch.position.y = 0.01
    scene.add(pitch)

    // Popping creases (white lines on the pitch)
    const creaseMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const crease = (z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.06), creaseMat)
      m.rotation.x = -Math.PI / 2
      m.position.set(0, 0.014, z)
      scene.add(m)
    }
    crease( STRIKER_Z - 1.22)
    crease(NON_STRIKER_Z + 1.22)

    // 30-yard inner fielding ring (cosmetic)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(13.7, 13.85, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    )
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.014; scene.add(ring)

    // Wickets at both ends
    addWickets(scene, world,  STRIKER_Z)
    addWickets(scene, world,  NON_STRIKER_Z)

    // Umpire — static decorative figure (not a Kicker)
    addUmpire(scene, UMPIRE_POSITION.x, UMPIRE_POSITION.z)

    // Sightscreens (white panels behind each wicket)
    const screenMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    const ss1 = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.3), screenMat)
    ss1.position.set(0, 2.0, STRIKER_Z + 12); ss1.castShadow = true; scene.add(ss1)
    const ss2 = ss1.clone()
    ss2.position.set(0, 2.0, NON_STRIKER_Z - 12); scene.add(ss2)

    // Boundary rope
    const ropeBoundary = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(HALF_L, HALF_W) - 1, 0.06, 6, 96),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    )
    ropeBoundary.rotation.x = -Math.PI / 2
    ropeBoundary.position.y = 0.06
    ropeBoundary.scale.set(HALF_L / Math.min(HALF_L, HALF_W), 1, HALF_W / Math.min(HALF_L, HALF_W))
    scene.add(ropeBoundary)

    // Boundary colliders (no walls — invisible)
    const bw = 4
    const wall = (sx, sz, x, z) => world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx, bw / 2, sz).setTranslation(x, bw / 2, z).setRestitution(0.3)
    )
    wall(HALF_L, 0.2, 0,  HALF_W); wall(HALF_L, 0.2, 0, -HALF_W)
    wall(0.2, HALF_W,  HALF_L, 0); wall(0.2, HALF_W, -HALF_L, 0)

    // Boundary cones around the inner ring + water bottles near sightscreens
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const r = 13.7
      this.dynamicProps.push(makeCone(this.engine.scene, this.engine.world, {
        x: Math.cos(ang) * r, z: Math.sin(ang) * r,
      }))
    }
    // Drinks waiting at the boundary
    for (let i = -1; i <= 1; i++) {
      this.dynamicProps.push(makeBottle(this.engine.scene, this.engine.world, {
        x: i * 1.5, z: STRIKER_Z + 11.5, color: 0x66ccff,
      }))
      this.dynamicProps.push(makeBottle(this.engine.scene, this.engine.world, {
        x: i * 1.5, z: NON_STRIKER_Z - 11.5, color: 0xff9933,
      }))
    }
  }
}

function addWickets(scene, world, z) {
  const stumpMat = new THREE.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.7 })
  const stumpGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.71, 10)
  for (let i = -1; i <= 1; i++) {
    const m = new THREE.Mesh(stumpGeo, stumpMat)
    m.position.set(i * 0.18, 0.355, z)
    m.castShadow = true
    scene.add(m)
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.355, 0.04)
        .setTranslation(i * 0.18, 0.355, z).setRestitution(0.4)
    )
  }
  // Bails on top
  const bailGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6)
  const bailMat = new THREE.MeshStandardMaterial({ color: 0xd4b890 })
  for (let i = -1; i <= 0; i++) {
    const b = new THREE.Mesh(bailGeo, bailMat)
    b.rotation.z = Math.PI / 2
    b.position.set(i * 0.18 + 0.09, 0.72, z)
    scene.add(b)
  }
}

// Static cosmetic umpire — white coat, hat, no AI/collider so the player
// can roll right past harmlessly (umpires don't tackle).
function addUmpire(scene, x, z) {
  const root = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: 0xf3c8a0, roughness: 0.7 })
  const coat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })
  const trousers = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 8), coat)
  torso.position.y = 1.1; torso.castShadow = true; root.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skin)
  head.position.y = 1.78; head.castShadow = true; root.add(head)
  // Hat
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  )
  hat.position.y = 1.95
  root.add(hat)
  const hatBrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  )
  hatBrim.position.y = 1.9
  root.add(hatBrim)

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8)
  const ll = new THREE.Mesh(legGeo, trousers); ll.position.set(-0.14, 0.35, 0); ll.castShadow = true; root.add(ll)
  const rl = new THREE.Mesh(legGeo, trousers); rl.position.set( 0.14, 0.35, 0); rl.castShadow = true; root.add(rl)

  root.position.set(x, 0, z)
  // Face toward the pitch
  root.rotation.y = Math.atan2(-x, -z)
  scene.add(root)
}
