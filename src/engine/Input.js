export class Input {
  constructor(domElement) {
    this.el = domElement
    this.keys = new Set()
    this.mouseDX = 0
    this.mouseDY = 0
    this.locked = false

    // Touch state
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window)
    this._touchFwd = 0
    this._touchStrafe = 0
    this._joyTouchId = null
    this._lookTouchId = null
    this._lookLast = { x: 0, y: 0 }
    this.touchSensitivity = 0.6  // multiplier for touch look drag

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    if (!this.isTouch) {
      this.el.addEventListener('click', this._requestLock)
      document.addEventListener('pointerlockchange', this._onLockChange)
      document.addEventListener('mousemove', this._onMouseMove)
    } else {
      this._setupTouch()
    }
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

  // ---------- Touch ----------

  _setupTouch() {
    this.el.addEventListener('touchstart', this._onTouchStart, { passive: false })
    this.el.addEventListener('touchmove', this._onTouchMove, { passive: false })
    this.el.addEventListener('touchend', this._onTouchEnd, { passive: false })
    this.el.addEventListener('touchcancel', this._onTouchEnd, { passive: false })
  }

  _isInJoystickZone(x, y) {
    // Bottom-left quadrant, ~140px square zone
    return x < 200 && y > window.innerHeight - 200
  }

  _onTouchStart = (e) => {
    for (const t of e.changedTouches) {
      // Skip touches starting on UI buttons (they handle their own events)
      if (t.target?.closest?.('#touch-actions, #menu, #hud, #gameover, #effects-bar, #back-btn, #retry')) continue

      const inJoystick = this._isInJoystickZone(t.clientX, t.clientY)
      if (inJoystick && this._joyTouchId === null) {
        this._joyTouchId = t.identifier
        this._joyOrigin = this._joystickCenter()
        this._updateJoystick(0, 0)
        this._showJoystick()
        e.preventDefault()
      } else if (!inJoystick && this._lookTouchId === null) {
        this._lookTouchId = t.identifier
        this._lookLast = { x: t.clientX, y: t.clientY }
      }
    }
  }

  _onTouchMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyTouchId) {
        const dx = t.clientX - this._joyOrigin.x
        const dy = t.clientY - this._joyOrigin.y
        const max = 55
        const mag = Math.hypot(dx, dy) || 1
        const k = mag > max ? max / mag : 1
        const cx = dx * k
        const cy = dy * k
        this._touchStrafe = cx / max
        this._touchFwd = -cy / max
        this._updateJoystick(cx, cy)
        e.preventDefault()
      } else if (t.identifier === this._lookTouchId) {
        const dx = t.clientX - this._lookLast.x
        const dy = t.clientY - this._lookLast.y
        this.mouseDX += dx * this.touchSensitivity
        this.mouseDY += dy * this.touchSensitivity
        this._lookLast = { x: t.clientX, y: t.clientY }
        e.preventDefault()
      }
    }
  }

  _onTouchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyTouchId) {
        this._joyTouchId = null
        this._touchFwd = 0
        this._touchStrafe = 0
        this._updateJoystick(0, 0)
        this._hideJoystick()
      } else if (t.identifier === this._lookTouchId) {
        this._lookTouchId = null
      }
    }
  }

  _joystickCenter() {
    const el = document.getElementById('touch-joystick')
    if (el) {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    return { x: 100, y: window.innerHeight - 100 }
  }

  _updateJoystick(dx, dy) {
    const thumb = document.querySelector('#touch-joystick .thumb')
    if (thumb) thumb.style.transform = `translate(${dx}px, ${dy}px)`
  }

  _showJoystick() {
    document.getElementById('touch-joystick')?.classList.add('active')
  }
  _hideJoystick() {
    document.getElementById('touch-joystick')?.classList.remove('active')
  }

  // ---------- Virtual key API for on-screen buttons ----------

  virtualKeyDown(code) { this.keys.add(code) }
  virtualKeyUp(code) { this.keys.delete(code) }
  virtualTap(code) {
    // Single-fire — adding to keys lets jumpPressed() / cameraTogglePressed()
    // consume it on the next frame.
    this.keys.add(code)
  }

  // ---------- Public API ----------

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

  axis() {
    const fwd = (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0)
    const strafe = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0)
    // Touch joystick takes priority when active
    if (Math.hypot(this._touchFwd, this._touchStrafe) > 0.05) {
      return { fwd: this._touchFwd, strafe: this._touchStrafe }
    }
    return { fwd, strafe }
  }

  jumpPressed() {
    if (this.keys.has('Space')) {
      this.keys.delete('Space')
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
    if (!this.isTouch) {
      this.el.removeEventListener('click', this._requestLock)
      document.removeEventListener('pointerlockchange', this._onLockChange)
      document.removeEventListener('mousemove', this._onMouseMove)
      if (document.pointerLockElement === this.el) document.exitPointerLock()
    } else {
      this.el.removeEventListener('touchstart', this._onTouchStart)
      this.el.removeEventListener('touchmove', this._onTouchMove)
      this.el.removeEventListener('touchend', this._onTouchEnd)
      this.el.removeEventListener('touchcancel', this._onTouchEnd)
    }
  }
}
