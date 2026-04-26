import * as THREE from 'three'

export const CAMERA_MODES = { THIRD: 'third', FIRST: 'first' }

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.005, 500)
    this.mode = CAMERA_MODES.THIRD
    this.yaw = 0
    this.pitch = -0.25
    this.distance = 5.5
    this.height = 2.4
    this.lookHeight = 0.5    // y-offset of look target above ball
    this.minY = 0.4          // minimum world Y for the camera (avoid ground clipping)
    this.mouseSensitivity = 0.0025

    window.addEventListener('resize', this._onResize)
  }

  /** Apply per-game settings (call after game start). */
  configure({ fov, distance, height, lookHeight, near, minY, mouseSensitivity } = {}) {
    if (fov != null) this.camera.fov = fov
    if (near != null) this.camera.near = near
    if (fov != null || near != null) this.camera.updateProjectionMatrix()
    if (distance != null) this.distance = distance
    if (height != null) this.height = height
    if (lookHeight != null) this.lookHeight = lookHeight
    if (minY != null) this.minY = minY
    if (mouseSensitivity != null) this.mouseSensitivity = mouseSensitivity
  }

  _onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }

  toggle() {
    this.mode = this.mode === CAMERA_MODES.THIRD ? CAMERA_MODES.FIRST : CAMERA_MODES.THIRD
  }

  applyMouse(dx, dy) {
    this.yaw -= dx * this.mouseSensitivity
    this.pitch -= dy * this.mouseSensitivity
    const max = Math.PI / 2 - 0.1
    if (this.pitch > max) this.pitch = max
    if (this.pitch < -max) this.pitch = -max
  }

  // Returns horizontal forward/right unit vectors derived from yaw (used by
  // ball controls so movement is camera-relative).
  basis() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    return { forward: f, right: r }
  }

  update(ballPos) {
    if (this.mode === CAMERA_MODES.THIRD) {
      const offsetX = -Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance
      const offsetY = -Math.sin(this.pitch) * this.distance + this.height
      const offsetZ = -Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance
      this.camera.position.set(
        ballPos.x - offsetX,
        Math.max(this.minY, ballPos.y + offsetY),
        ballPos.z - offsetZ
      )
      this.camera.lookAt(ballPos.x, ballPos.y + this.lookHeight, ballPos.z)
    } else {
      // First-person: camera at ball center, looking forward by yaw/pitch
      this.camera.position.set(ballPos.x, ballPos.y, ballPos.z)
      const lx = ballPos.x + -Math.sin(this.yaw) * Math.cos(this.pitch)
      const ly = ballPos.y + Math.sin(this.pitch)
      const lz = ballPos.z + -Math.cos(this.yaw) * Math.cos(this.pitch)
      this.camera.lookAt(lx, ly, lz)
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
  }
}
