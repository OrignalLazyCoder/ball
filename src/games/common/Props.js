import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

/**
 * Dynamic, knockable scene props. Each helper creates a small rigid body
 * + visual root group and returns a `{ root, body, scene, world }` token —
 * the caller stores it in `this.dynamicProps` so BaseGame can sync the
 * mesh transform from physics each frame and clean up on dispose.
 */

export function makeBottle(scene, world, { x, z, color = 0x66ccff, capColor = 0x113344 } = {}) {
  const root = new THREE.Group()
  const h = 0.22, r = 0.04
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 12),
    new THREE.MeshStandardMaterial({
      color, roughness: 0.25, transparent: true, opacity: 0.7,
    })
  )
  body.castShadow = true
  root.add(body)
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.05, 8),
    new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.6 })
  )
  cap.position.y = h / 2 + 0.025
  root.add(cap)
  scene.add(root)

  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, h / 2, z)
      .setLinearDamping(2.5)
      .setAngularDamping(3.0)
      .setCcdEnabled(true)
  )
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(h / 2, r)
      .setRestitution(0.15).setFriction(0.6).setDensity(0.4),
    rb
  )
  return { root, body: rb, scene, world }
}

export function makeCone(scene, world, { x, z, color = 0xff7733 } = {}) {
  const root = new THREE.Group()
  const h = 0.45, r = 0.18
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(r, h, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  )
  cone.castShadow = true
  cone.position.y = h / 2
  root.add(cone)
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.06, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
  )
  stripe.position.y = h * 0.45
  root.add(stripe)
  scene.add(root)

  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, h / 2, z)
      .setLinearDamping(2.0)
      .setAngularDamping(2.5)
  )
  // Use cylinder collider (stable) at average radius
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(h / 2, r * 0.7)
      .setRestitution(0.15).setFriction(0.7).setDensity(0.5),
    rb
  )
  return { root, body: rb, scene, world }
}

export function makeCornerFlag(scene, world, { x, z, color = 0xff3333 } = {}) {
  const root = new THREE.Group()
  const poleH = 1.4, poleR = 0.02
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(poleR, poleR, poleH, 8),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee })
  )
  pole.position.y = poleH / 2
  root.add(pole)
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.28),
    new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })
  )
  flag.position.set(0.22, poleH - 0.16, 0)
  root.add(flag)
  scene.add(root)

  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, poleH / 2, z)
      .setLinearDamping(3.5)
      .setAngularDamping(3.5)
  )
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(poleH / 2, 0.05)
      .setRestitution(0.05).setFriction(0.7).setDensity(0.25),
    rb
  )
  return { root, body: rb, scene, world }
}

export function makeBench(scene, world, { x, z, yaw = 0, color = 0x884422 } = {}) {
  const root = new THREE.Group()
  const len = 2.4, depth = 0.4, seatH = 0.45, backH = 0.5
  const woodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  const seat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, depth), woodMat)
  seat.position.y = seatH; seat.castShadow = true
  root.add(seat)
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, backH, 0.06), woodMat)
  back.position.set(0, seatH + backH / 2, -depth / 2 + 0.03)
  root.add(back)
  // Legs
  const legGeo = new THREE.BoxGeometry(0.06, seatH, 0.06)
  const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 })
  ;[[-len / 2 + 0.1, depth / 2 - 0.05], [len / 2 - 0.1, depth / 2 - 0.05],
    [-len / 2 + 0.1, -depth / 2 + 0.05], [len / 2 - 0.1, -depth / 2 + 0.05]].forEach(([dx, dz]) => {
    const lg = new THREE.Mesh(legGeo, legMat)
    lg.position.set(dx, seatH / 2, dz)
    root.add(lg)
  })
  root.position.set(x, 0, z)
  root.rotation.y = yaw
  scene.add(root)

  // Static collider — bench is heavy, don't make it dynamic
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(len / 2, seatH / 2, depth / 2)
      .setTranslation(x, seatH / 2, z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setRestitution(0.2).setFriction(0.6)
  )
  return { root, body: null, scene, world }
}

/** Small box of spare balls — visually three tiny spheres in a tray. */
export function makeBallBucket(scene, world, { x, z, ballColor = 0xc7e030 } = {}) {
  const root = new THREE.Group()
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.1, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x664422 })
  )
  tray.position.y = 0.05
  tray.castShadow = true
  root.add(tray)
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 12),
      new THREE.MeshStandardMaterial({ color: ballColor, roughness: 0.4 })
    )
    b.position.set((i - 2) * 0.06 + (Math.random() - 0.5) * 0.02, 0.13 + Math.random() * 0.02, (Math.random() - 0.5) * 0.07)
    root.add(b)
  }
  root.position.set(x, 0, z)
  scene.add(root)
  // Static — heavy tray
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.2, 0.05, 0.15)
      .setTranslation(x, 0.05, z).setRestitution(0.2).setFriction(0.6)
  )
  return { root, body: null, scene, world }
}

export function disposeProp(prop) {
  prop.scene.remove(prop.root)
  if (prop.body) {
    try { prop.world.removeRigidBody(prop.body) } catch {}
  }
  prop.root.traverse(o => {
    o.geometry?.dispose?.()
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach(m => m?.dispose?.())
  })
}
