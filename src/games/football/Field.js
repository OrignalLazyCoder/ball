import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export const FIELD_HALF_LENGTH = 40
export const FIELD_HALF_WIDTH = 25

export class Field {
  constructor(scene, world) {
    // Pitch
    const grass = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 1 })
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_HALF_LENGTH * 2, FIELD_HALF_WIDTH * 2),
      grass
    )
    pitch.rotation.x = -Math.PI / 2
    pitch.receiveShadow = true
    scene.add(pitch)

    world.createCollider(
      RAPIER.ColliderDesc.cuboid(FIELD_HALF_LENGTH, 0.05, FIELD_HALF_WIDTH)
        .setTranslation(0, -0.05, 0)
        .setFriction(0.85).setRestitution(0.3)
    )

    // Pitch lines
    addLines(scene)

    // Boundary walls (invisible) so ball + AI don't escape
    const wallH = 4
    const walls = [
      { x: 0, z:  FIELD_HALF_WIDTH,   sx: FIELD_HALF_LENGTH, sz: 0.5 },
      { x: 0, z: -FIELD_HALF_WIDTH,   sx: FIELD_HALF_LENGTH, sz: 0.5 },
      { x:  FIELD_HALF_LENGTH, z: 0,  sx: 0.5, sz: FIELD_HALF_WIDTH },
      { x: -FIELD_HALF_LENGTH, z: 0,  sx: 0.5, sz: FIELD_HALF_WIDTH }
    ]
    walls.forEach(w => {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(w.sx, wallH / 2, w.sz)
          .setTranslation(w.x, wallH / 2, w.z).setRestitution(0.3).setFriction(0.5)
      )
    })

    // Goals (cosmetic visual + collider)
    addGoal(scene, world,  FIELD_HALF_LENGTH - 0.3)
    addGoal(scene, world, -FIELD_HALF_LENGTH + 0.3, true)
  }
}

function addLines(scene) {
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const stripe = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.012, z)
    scene.add(m)
  }
  // Outer rectangle
  stripe(FIELD_HALF_LENGTH * 2, 0.1, 0,  FIELD_HALF_WIDTH - 0.05)
  stripe(FIELD_HALF_LENGTH * 2, 0.1, 0, -FIELD_HALF_WIDTH + 0.05)
  stripe(0.1, FIELD_HALF_WIDTH * 2,  FIELD_HALF_LENGTH - 0.05, 0)
  stripe(0.1, FIELD_HALF_WIDTH * 2, -FIELD_HALF_LENGTH + 0.05, 0)
  // Halfway line
  stripe(0.1, FIELD_HALF_WIDTH * 2, 0, 0)
  // Center circle
  const circle = new THREE.Mesh(new THREE.RingGeometry(6, 6.1, 64), lineMat)
  circle.rotation.x = -Math.PI / 2
  circle.position.y = 0.012
  scene.add(circle)
}

function addGoal(scene, world, x, mirror = false) {
  const sign = mirror ? -1 : 1
  const goalW = 7.32
  const goalH = 2.44
  const halfW = goalW / 2
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.5 })
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, goalH, 12)
  const left = new THREE.Mesh(postGeo, postMat)
  left.position.set(x, goalH / 2, -halfW); left.castShadow = true; scene.add(left)
  const right = new THREE.Mesh(postGeo, postMat)
  right.position.set(x, goalH / 2,  halfW); right.castShadow = true; scene.add(right)
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, goalW, 12), postMat)
  cross.rotation.x = Math.PI / 2
  cross.position.set(x, goalH, 0); cross.castShadow = true; scene.add(cross)

  // Net (cosmetic)
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.4 })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(goalW, goalH, 10, 6), netMat)
  back.position.set(x + sign * 1.6, goalH / 2, 0); back.rotation.y = sign * Math.PI / 2; scene.add(back)

  // Post colliders
  const post = (z) => world.createCollider(
    RAPIER.ColliderDesc.cylinder(goalH / 2, 0.08).setTranslation(x, goalH / 2, z).setRestitution(0.4)
  )
  post(-halfW); post(halfW)
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.08, 0.08, halfW).setTranslation(x, goalH, 0).setRestitution(0.4)
  )
}
