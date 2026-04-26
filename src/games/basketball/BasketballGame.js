import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { BaseGame } from '../../engine/BaseGame.js'
import { makeBottle, makeCone, makeBench } from '../common/Props.js'

const HALF_L = 18, HALF_W = 12

export class BasketballGame extends BaseGame {
  static id = 'basketball'
  static label = '🏀 BASKETBALL'

  engineConfig() {
    return {
      sky: 0x4a5666,
      fog: { color: 0x4a5666, near: 60, far: 180 },
      ambient: 0x77665a,
      sunIntensity: 2.6,
    }
  }

  arenaBounds() { return { halfLength: HALF_L, halfWidth: HALF_W } }
  defaultWeapon() { return 'foot' }
  initialEnemyCount() { return 3 }
  maxEnemies() { return 100 }

  ballSpec() {
    return { radius: 0.12, mass: 0.62, restitution: 0.92, friction: 0.85 }
  }

  cameraConfig() {
    return { fov: 70, distance: 3.4, height: 1.6, lookHeight: 0.7, near: 0.02, minY: 0.25 }
  }

  configureBall() {
    const ball = this.engine.ball
    ball.setAppearance({
      color: 0xd2691e,
      emissive: 0x6a2010,
      emissiveIntensity: 0.55,
      lightColor: 0xff8844,
      lightIntensity: 1.2,
    })
    ball.collider.setRestitution(0.92)
    ball.body.setLinearDamping(0.08)
    ball._autoDribble = true
  }

  buildArena() {
    const scene = this.engine.scene, world = this.engine.world
    // Hardwood floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_L * 2, HALF_W * 2),
      new THREE.MeshStandardMaterial({ color: 0xb27a3e, roughness: 0.6 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF_L, 0.05, HALF_W)
        .setTranslation(0, -0.05, 0).setFriction(0.55).setRestitution(0.85)
    )

    // Court lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const stripe = (w, l, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat)
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.012, z)
      scene.add(m)
    }
    stripe(HALF_L * 2 - 0.5, 0.1, 0, 0) // halfway
    const center = new THREE.Mesh(new THREE.RingGeometry(1.8, 1.9, 48), lineMat)
    center.rotation.x = -Math.PI / 2; center.position.y = 0.013; scene.add(center)

    // Invisible boundary colliders (no mesh)
    const wallH = 4
    const wall = (sx, sz, x, z) => world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx, wallH / 2, sz)
        .setTranslation(x, wallH / 2, z).setRestitution(0.4)
    )
    wall(HALF_L, 0.2, 0,  HALF_W + 0.1)
    wall(HALF_L, 0.2, 0, -HALF_W - 0.1)
    wall(0.2, HALF_W,  HALF_L + 0.1, 0)
    wall(0.2, HALF_W, -HALF_L - 0.1, 0)

    // Two hoops at each end
    addHoop(scene, world,  HALF_L - 1.5, 0)
    addHoop(scene, world, -HALF_L + 1.5, Math.PI)

    // Sideline benches + water bottles + cones
    this.dynamicProps.push(makeBench(scene, world, { x: 0, z:  HALF_W - 1, yaw: Math.PI }))
    this.dynamicProps.push(makeBench(scene, world, { x: 0, z: -HALF_W + 1 }))
    for (let i = -2; i <= 2; i++) {
      this.dynamicProps.push(makeBottle(scene, world, { x: i * 1.5 - 4, z:  HALF_W - 0.5, color: 0xfb923c }))
      this.dynamicProps.push(makeBottle(scene, world, { x: i * 1.5 + 4, z: -HALF_W + 0.5, color: 0xc0392b }))
    }
    for (let i = 0; i < 4; i++) {
      this.dynamicProps.push(makeCone(scene, world, {
        x: (Math.random() - 0.5) * 6,
        z: (Math.random() - 0.5) * 6,
      }))
    }
  }
}

function addHoop(scene, world, x, yaw) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
  // Pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 3.5, 12),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6 })
  )
  pole.position.set(x, 1.75, 0); pole.castShadow = true; scene.add(pole)
  world.createCollider(RAPIER.ColliderDesc.cylinder(1.75, 0.08).setTranslation(x, 1.75, 0))

  // Backboard
  const bb = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.0, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
  )
  bb.position.set(x - 0.4 * cosY, 3.0, -0.4 * sinY)
  bb.rotation.y = yaw
  scene.add(bb)
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.025, 0.5, 0.8)
      .setTranslation(x - 0.4 * cosY, 3.0, -0.4 * sinY)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setRestitution(0.6)
  )
  // Rim torus
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.025, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xff6600, metalness: 0.6 })
  )
  rim.rotation.x = Math.PI / 2
  rim.position.set(x - 0.1 * cosY, 2.8, -0.1 * sinY)
  scene.add(rim)
}
