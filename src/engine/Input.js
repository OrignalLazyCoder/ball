export class Input {
  constructor(domElement) {
    this.el = domElement
    this.keys = new Set()
    this.mouseDX = 0
    this.mouseDY = 0
    this.locked = false

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    this.el.addEventListener('click', this._requestLock)
    document.addEventListener('pointerlockchange', this._onLockChange)
    document.addEventListener('mousemove', this._onMouseMove)
  }

  _onKeyDown = (e) => {
    this.keys.add(e.code)
    if (e.code === 'Space') e.preventDefault()
  }

  _onKeyUp = (e) => {
    this.keys.delete(e.code)
  }

  _requestLock = () => {
    if (!this.locked && document.pointerLockElement !== this.el) {
      this.el.requestPointerLock?.()
    }
  }

  _onLockChange = () => {
    this.locked = document.pointerLockElement === this.el
  }

  _onMouseMove = (e) => {
    if (!this.locked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }

  consumeMouseDelta() {
    const dx = this.mouseDX
    const dy = this.mouseDY
    this.mouseDX = 0
    this.mouseDY = 0
    return { dx, dy }
  }

  isDown(...codes) {
    return codes.some(c => this.keys.has(c))
  }

  // Returns -1, 0, or 1 along forward/strafe axes (camera-relative directions
  // are computed by the consumer).
  axis() {
    const fwd = (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0)
    const strafe = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0)
    return { fwd, strafe }
  }

  jumpPressed() {
    if (this.keys.has('Space')) {
      this.keys.delete('Space')   // single-fire
      return true
    }
    return false
  }

  cameraTogglePressed() {
    if (this.keys.has('KeyC')) {
      this.keys.delete('KeyC')
      return true
    }
    return false
  }

  mutePressed() {
    if (this.keys.has('KeyM')) {
      this.keys.delete('KeyM')
      return true
    }
    return false
  }

  sprinting() {
    return this.isDown('ShiftLeft', 'ShiftRight')
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this.el.removeEventListener('click', this._requestLock)
    document.removeEventListener('pointerlockchange', this._onLockChange)
    document.removeEventListener('mousemove', this._onMouseMove)
    if (document.pointerLockElement === this.el) document.exitPointerLock()
  }
}
