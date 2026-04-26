import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { BaseGame } from '../../engine/BaseGame.js'
import { makeBottle, makeBallBucket, makeBench } from '../common/Props.js'

const HALF_L = 18, HALF_W = 12

export class TennisGame extends BaseGame {
  static id = 'tennis'
  static label = '🎾 TENNIS'

  engineConfig() {
    return {
      sky: 0xffd58c,
      fog: { color: 0xeed8a0, near: 30, far: 90 },
      ambient: 0x665544,
    }
  }

  arenaBounds() { return { halfLength: HALF_L, halfWidth: HALF_W } }
  defaultWeapon() { return 'racket' }
  initialEnemyCount() { return 4 }
  maxEnemies() { return 100 }

  ballSpec() {
    // Real tennis ball: ~6.6cm dia, 58g
    return { radius: 0.033, mass: 0.058, restitution: 0.75, friction: 0.85 }
  }

  cameraConfig() {
    return { fov: 76, distance: 1.6, height: 0.75, lookHeight: 0.35, near: 0.005, minY: 0.1 }
  }

  configureBall() {
    const ball = this.engine.ball
    ball.setAppearance({
      color: 0xc7e030,
      emissive: 0x556610,
      emissiveIntensity: 0.45,
      lightColor: 0xddff66,
      lightIntensity: 1.0,
    })
    ball.collider.setRestitution(0.7)
  }

  buildArena() {
    const scene = this.engine.scene, world = this.engine.world

    // Hard court — blue surround + green court
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_L * 2, HALF_W * 2),
      new THREE.MeshStandardMaterial({ color: 0x2d6692, roughness: 0.95 })
    )
    surround.rotation.x = -Math.PI / 2
    surround.receiveShadow = true
    scene.add(surround)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF_L, 0.05, HALF_W)
        .setTranslation(0, -0.05, 0).setFriction(0.65).setRestitution(0.6)
    )

    // Court inner
    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(11.0, 23.77),
      new THREE.MeshStandardMaterial({ color: 0x4a8e3f, roughness: 0.95 })
    )
    court.rotation.x = -Math.PI / 2
    court.position.y = 0.005
    scene.add(court)

    // Lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const stripe = (w, l, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat)
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.012, z)
      scene.add(m)
    }
    // Sidelines + baselines
    stripe(0.06, 23.77, -5.5, 0); stripe(0.06, 23.77, 5.5, 0)
    stripe(11.0, 0.06, 0, -11.885); stripe(11.0, 0.06, 0, 11.885)
    // Service lines
    stripe(8.23, 0.06, 0, -6.4); stripe(8.23, 0.06, 0, 6.4)
    stripe(0.06, 12.8, 0, 0)

    // Net
    const netMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, wireframe: true, transparent: true, opacity: 0.7 })
    const net = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 0.95, 18, 5), netMat)
    net.position.set(0, 0.475, 0)
    scene.add(net)
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 0.06, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    )
    tape.position.set(0, 0.95, 0)
    scene.add(tape)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(5.75, 0.475, 0.015)
        .setTranslation(0, 0.475, 0).setRestitution(0.2)
    )
    // Net posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222222 })
    const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.07, 12), postMat)
    lp.position.set(-5.75, 0.535, 0); scene.add(lp)
    const rp = lp.clone(); rp.position.x = 5.75; scene.add(rp)

    // Boundary walls (invisible)
    const wallH = 4
    const w = (sx, sz, x, z) => world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx, wallH / 2, sz).setTranslation(x, wallH / 2, z)
    )
    w(HALF_L, 0.2, 0,  HALF_W); w(HALF_L, 0.2, 0, -HALF_W)
    w(0.2, HALF_W,  HALF_L, 0); w(0.2, HALF_W, -HALF_L, 0)

    // Player benches at each baseline
    this.dynamicProps.push(makeBench(scene, world, { x: -3, z:  HALF_W - 1.5, yaw: Math.PI }))
    this.dynamicProps.push(makeBench(scene, world, { x:  3, z: -HALF_W + 1.5 }))

    // Ball baskets full of spare yellow balls
    this.dynamicProps.push(makeBallBucket(scene, world, { x: -5, z:  HALF_W - 2, ballColor: 0xc7e030 }))
    this.dynamicProps.push(makeBallBucket(scene, world, { x:  5, z: -HALF_W + 2, ballColor: 0xc7e030 }))

    // Water bottles
    for (let i = -1; i <= 1; i++) {
      this.dynamicProps.push(makeBottle(scene, world, { x: i * 0.4 - 1.5, z:  HALF_W - 1.5, color: 0x66ccff }))
      this.dynamicProps.push(makeBottle(scene, world, { x: i * 0.4 + 1.5, z: -HALF_W + 1.5, color: 0xff9933 }))
    }
  }
}
