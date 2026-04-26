import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

import { Ball } from './Ball.js'
import { CameraRig, CAMERA_MODES } from './CameraRig.js'
import { Input } from './Input.js'
import { GameLoop } from './GameLoop.js'
import { AudioEngine } from './Audio.js'

/**
 * Reusable engine that owns the scene, physics world, ball, camera, input,
 * and main loop. A "game" composes this engine and adds its own world content
 * via `onStep` and `onRender` hooks (or by reading `engine.scene` directly).
 *
 * Subsequent games (basketball court, dodgeball arena, etc.) can reuse this
 * shell — they only need to populate `scene` + `world` with their own
 * environment and entities.
 */
export class BallEngine {
  constructor({
    container,
    sky = 0x87ceeb,
    fog = { color: 0x87ceeb, near: 60, far: 180 },
    gravity = { x: 0, y: -18, z: 0 },
    ambient = 0x445544,
    sunIntensity = 2.4,
    shadowExtent = 50,
  } = {}) {
    this.container = container || document.getElementById('app')
    this.skyColor = sky
    this.fogConfig = fog
    this.gravity = gravity
    this.ambientColor = ambient
    this.sunIntensity = sunIntensity
    this.shadowExtent = shadowExtent

    this.onStep = null
    this.onRender = null
    this.disposed = false
  }

  async init(ballSpec = {}) {
    await RAPIER.init()

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(this.skyColor)
    if (this.fogConfig) {
      this.scene.fog = new THREE.Fog(this.fogConfig.color, this.fogConfig.near, this.fogConfig.far)
    }
    this._setupLighting()

    this.world = new RAPIER.World(this.gravity)
    this.eventQueue = new RAPIER.EventQueue(true)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.container.appendChild(this.renderer.domElement)
    this._onResize = () => this.renderer.setSize(window.innerWidth, window.innerHeight)
    window.addEventListener('resize', this._onResize)

    this.ball = new Ball(this.world, this.scene, ballSpec)
    this.cameraRig = new CameraRig()
    this.input = new Input(this.renderer.domElement)
    this.audio = new AudioEngine()

    this.loop = new GameLoop({
      step: (dt) => this._step(dt),
      render: (dt) => this._render(dt),
    })
  }

  start() { this.loop?.start() }
  stop()  { this.loop?.stop() }

  _step(dt) {
    // Ball control via input + camera-relative basis
    this.ball.updateGrounded()
    const { forward, right } = this.cameraRig.basis()
    const { fwd, strafe } = this.input.axis()
    this.ball.applyControl(
      dt, forward, right, fwd, strafe,
      this.input.sprinting(), this.input.jumpPressed()
    )

    this.onStep?.(dt)

    this.world.step(this.eventQueue)
    this.ball.syncMesh()
  }

  _render(dt) {
    // Camera mouse delta + toggle handled per render frame so 144Hz monitors
    // get smooth aiming instead of being locked to the 60Hz physics step.
    const md = this.input.consumeMouseDelta()
    this.cameraRig.applyMouse(md.dx, md.dy)
    if (this.input.cameraTogglePressed()) this.cameraRig.toggle()
    if (this.input.mutePressed?.()) {
      const muted = this.audio.toggleMute()
      this._showMuteToast?.(muted)
    }

    const ballPos = this.ball.position()
    this.cameraRig.update(ballPos)
    this.ball.mesh.visible = this.cameraRig.mode !== CAMERA_MODES.FIRST
    this.onRender?.(dt)
    this.renderer.render(this.scene, this.cameraRig.camera)
  }

  _setupLighting() {
    const sun = new THREE.DirectionalLight(0xffffff, this.sunIntensity)
    sun.position.set(20, 40, 15)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const e = this.shadowExtent
    sun.shadow.camera.left = -e; sun.shadow.camera.right = e
    sun.shadow.camera.top = e;   sun.shadow.camera.bottom = -e
    sun.shadow.camera.far = 120
    this.scene.add(sun)
    this.scene.add(new THREE.HemisphereLight(0xa0d8ff, this.ambientColor, 0.6))
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.loop?.stop()
    window.removeEventListener('resize', this._onResize)
    this.input?.dispose()
    this.cameraRig?.dispose()
    this.audio?.stopMusic()
    this.audio?.setRollPlaying(false)
    this.audio?.setFirePlaying(false)
    this.scene?.traverse(obj => {
      obj.geometry?.dispose?.()
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach(m => { m?.map?.dispose?.(); m?.dispose?.() })
    })
    this.renderer?.dispose()
    this.renderer?.domElement?.remove()
  }
}

export { CAMERA_MODES }
