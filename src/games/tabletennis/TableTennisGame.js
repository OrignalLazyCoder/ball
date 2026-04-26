import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { BaseGame } from '../../engine/BaseGame.js'
import { makeBottle, makeBallBucket } from '../common/Props.js'

const HALF_L = 12, HALF_W = 8

export class TableTennisGame extends BaseGame {
  static id = 'tabletennis'
  static label = '🏓 TABLE TENNIS'

  engineConfig() {
    return {
      sky: 0x4f5260,
      fog: { color: 0x4f5260, near: 30, far: 70 },
      ambient: 0x665a66,
      sunIntensity: 2.4,
      gravity: { x: 0, y: -16, z: 0 },
    }
  }

  arenaBounds() { return { halfLength: HALF_L, halfWidth: HALF_W } }
  defaultWeapon() { return 'paddle' }
  groundY() { return 0.76 }   // Table top is the playing surface
  initialEnemyCount() { return 3 }
  maxEnemies() { return 100 }

  ballSpec() {
    // Real ping-pong ball: ~4cm dia, 2.7g, super bouncy
    return { radius: 0.02, mass: 0.0027, restitution: 0.9, friction: 0.6 }
  }

  cameraConfig() {
    // Camera at table-top level so we can actually see the ball
    return { fov: 80, distance: 1.0, height: 0.45, lookHeight: 0.15, near: 0.003, minY: 0.78 }
  }

  configureBall() {
    const ball = this.engine.ball
    ball.setAppearance({
      color: 0xffffff,
      emissive: 0xaaaaaa,
      emissiveIntensity: 0.5,
      lightColor: 0xffffff,
      lightIntensity: 1.4,
    })
    ball.collider.setRestitution(0.88)
  }

  buildArena() {
    const scene = this.engine.scene, world = this.engine.world

    // Wooden room floor (under the table)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_L * 2, HALF_W * 2),
      new THREE.MeshStandardMaterial({ color: 0x4d3a26, roughness: 0.85 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    // Table-level "floor" — the table top is the ball's playing surface,
    // raised slightly. We collide on the table, not on the floor below.
    // Players walk around at floor level, leaning over to swat at the ball.
    const tableH = 0.76
    const tableW = 1.525, tableL = 2.74
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(tableL, 0.05, tableW),
      new THREE.MeshStandardMaterial({ color: 0x0d4d27, roughness: 0.5 })
    )
    tableTop.position.y = tableH
    tableTop.castShadow = true
    tableTop.receiveShadow = true
    scene.add(tableTop)
    // Make table top collidable as the playable ground
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(tableL / 2, 0.025, tableW / 2)
        .setTranslation(0, tableH, 0).setRestitution(0.85).setFriction(0.4)
    )
    // White table edge lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const edge = (sx, sz, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), lineMat)
      m.rotation.x = -Math.PI / 2
      m.position.set(x, tableH + 0.026, z)
      scene.add(m)
    }
    edge(tableL, 0.02, 0,  tableW / 2 - 0.02); edge(tableL, 0.02, 0, -tableW / 2 + 0.02)
    edge(0.02, tableW,  tableL / 2 - 0.02, 0); edge(0.02, tableW, -tableL / 2 + 0.02, 0)
    edge(0.02, tableW, 0, 0)   // center line

    // Net
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    const net = new THREE.Mesh(new THREE.PlaneGeometry(tableW + 0.3, 0.155), netMat)
    net.rotation.y = Math.PI / 2
    net.position.set(0, tableH + 0.0775, 0)
    scene.add(net)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.01, 0.078, tableW / 2 + 0.15)
        .setTranslation(0, tableH + 0.078, 0).setRestitution(0.4)
    )

    // Table legs (cosmetic)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 })
    ;[[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, tableH, 0.06), legMat)
      leg.position.set(sx * (tableL / 2 - 0.1), tableH / 2, sz * (tableW / 2 - 0.1))
      scene.add(leg)
    })

    // Invisible boundary colliders only
    const wallH = 4
    const wall = (sx, sz, x, z) => world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx, wallH / 2, sz)
        .setTranslation(x, wallH / 2, z).setRestitution(0.6)
    )
    wall(HALF_L, 0.2, 0,  HALF_W + 0.1)
    wall(HALF_L, 0.2, 0, -HALF_W - 0.1)
    wall(0.2, HALF_W,  HALF_L + 0.1, 0)
    wall(0.2, HALF_W, -HALF_L - 0.1, 0)

    // Overhead lamp for atmosphere
    const lamp = new THREE.PointLight(0xfff5cc, 1.6, 22)
    lamp.position.set(0, 5, 0); scene.add(lamp)

    // Spare ball box on the floor (full of white ping-pong balls)
    this.dynamicProps.push(makeBallBucket(scene, world, { x: -4, z: 4, ballColor: 0xffffff }))
    this.dynamicProps.push(makeBallBucket(scene, world, { x:  4, z: -4, ballColor: 0xffffff }))
    // Drink cans around the room
    for (const [px, pz] of [[-5, -3], [5, 3], [-3, 5], [4, -2]]) {
      this.dynamicProps.push(makeBottle(scene, world, { x: px, z: pz, color: 0xff5050 }))
    }
  }

  // Slower spawn cadence so the small room doesn't fill up at once
  initialSpawnGap() { return 2.6 }
  initialSpawnDelay() { return 2.0 }

  // Enemies spawn around the room, not on the table — at fixed perimeter
  // positions so they arrive from clearly different sides
  enemySpawnPosition(idx) {
    const total = Math.max(1, this.initialEnemyCount())
    const ang = (idx / total) * Math.PI * 2 + Math.PI / 6
    return {
      x: Math.cos(ang) * (HALF_L - 2),
      z: Math.sin(ang) * (HALF_W - 2),
    }
  }
}
