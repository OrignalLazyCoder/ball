import * as THREE from 'three'

/**
 * Canvas overlay for navigation aids:
 *   - Minimap (bottom-right) showing field, ball, and threats
 *   - Offscreen threat markers — red pips on the screen edge pointing toward
 *     kickers that aren't currently visible
 *   - Subtle red pulse for kickers actively winding up a kick
 */
export class HudOverlay {
  constructor({ camera, fieldHalfLength, fieldHalfWidth, target = document.body }) {
    this.camera = camera
    this.fieldHalfLength = fieldHalfLength
    this.fieldHalfWidth = fieldHalfWidth

    this.canvas = document.createElement('canvas')
    this.canvas.id = 'hud-canvas'
    this.canvas.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 4;
    `
    target.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')

    this._tmpVec = new THREE.Vector3()
    this._tmpProj = new THREE.Vector3()
    this._resize()
    window.addEventListener('resize', this._resize)
  }

  _resize = () => {
    const dpr = Math.min(window.devicePixelRatio, 2)
    this.canvas.width = window.innerWidth * dpr
    this.canvas.height = window.innerHeight * dpr
    this.canvas.style.width = window.innerWidth + 'px'
    this.canvas.style.height = window.innerHeight + 'px'
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  render(ballPos, kickers, powerUps = []) {
    const W = window.innerWidth, H = window.innerHeight
    const ctx = this.ctx
    ctx.clearRect(0, 0, W, H)

    this._drawThreatMarkers(ctx, W, H, ballPos, kickers)
    this._drawPowerupMarkers(ctx, W, H, ballPos, powerUps)
    this._drawMinimap(ctx, W, H, ballPos, kickers, powerUps)
  }

  _drawThreatMarkers(ctx, W, H, ballPos, kickers) {
    const margin = 40
    const cx = W / 2
    const cy = H / 2

    for (const k of kickers) {
      if (k.isAlive && !k.isAlive()) continue
      const p = k.body.translation()
      this._tmpProj.set(p.x, p.y + 1.2, p.z).project(this.camera)

      // Behind camera flag (z > 1 in NDC means clipped behind)
      const behind = this._tmpProj.z > 1 || this._tmpProj.z < -1
      let sx = (this._tmpProj.x * 0.5 + 0.5) * W
      let sy = (1 - (this._tmpProj.y * 0.5 + 0.5)) * H
      if (behind) {
        // Reflect through center so the marker drifts to the opposite edge
        sx = W - sx
        sy = H - sy
      }
      const onScreen = !behind &&
        sx > margin && sx < W - margin &&
        sy > margin && sy < H - margin

      const danger = k.isThreatening?.() ?? false
      const dist = Math.hypot(p.x - ballPos.x, p.z - ballPos.z)

      if (onScreen) {
        // Subtle on-screen marker only when winding up — flag the immediate threat
        if (danger) {
          this._drawDangerHalo(ctx, sx, sy)
        }
        continue
      }

      // Off-screen: clamp to ring around the center
      const dx = sx - cx
      const dy = sy - cy
      const ang = Math.atan2(dy, dx)
      const ringX = cx + Math.cos(ang) * (W / 2 - margin)
      const ringY = cy + Math.sin(ang) * (H / 2 - margin)

      this._drawEdgeIndicator(ctx, ringX, ringY, ang, danger, dist)
    }
  }

  _drawEdgeIndicator(ctx, x, y, ang, danger, dist) {
    const radius = danger ? 16 : 12
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    // Triangle pointing outward (toward the kicker)
    ctx.fillStyle = danger ? 'rgba(255, 50, 50, 0.95)' : 'rgba(255, 80, 80, 0.7)'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(radius, 0)
    ctx.lineTo(-radius * 0.6, -radius * 0.7)
    ctx.lineTo(-radius * 0.6, radius * 0.7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // Distance label
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(Math.round(dist) + 'm', x, y)
  }

  _drawPowerupMarkers(ctx, W, H, ballPos, powerUps) {
    const margin = 60
    const cx = W / 2, cy = H / 2
    for (const p of powerUps) {
      if (p.collected) continue
      const wp = p.root.position
      this._tmpProj.set(wp.x, wp.y, wp.z).project(this.camera)
      const behind = this._tmpProj.z > 1 || this._tmpProj.z < -1
      let sx = (this._tmpProj.x * 0.5 + 0.5) * W
      let sy = (1 - (this._tmpProj.y * 0.5 + 0.5)) * H
      if (behind) { sx = W - sx; sy = H - sy }

      const onScreen = !behind && sx > margin && sx < W - margin && sy > margin && sy < H - margin
      if (onScreen) continue

      const dx = sx - cx, dy = sy - cy
      const ang = Math.atan2(dy, dx)
      const ringX = cx + Math.cos(ang) * (W / 2 - margin)
      const ringY = cy + Math.sin(ang) * (H / 2 - margin)

      // Diamond (powerup) marker
      ctx.save()
      ctx.translate(ringX, ringY)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = colorHex(p.type.color, 0.9)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.fillRect(-9, -9, 18, 18)
      ctx.strokeRect(-9, -9, 18, 18)
      ctx.restore()
    }
  }

  _drawDangerHalo(ctx, x, y) {
    const t = (performance.now() / 200) % (Math.PI * 2)
    const pulse = 1 + Math.sin(t) * 0.25
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, 22 * pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, 32 * pulse, 0, Math.PI * 2)
    ctx.stroke()
  }

  _drawMinimap(ctx, W, H, ballPos, kickers, powerUps = []) {
    const mw = 200, mh = 130, pad = 16
    const x0 = W - mw - pad
    const y0 = H - mh - pad

    // Background panel
    ctx.fillStyle = 'rgba(6, 30, 14, 0.7)'
    ctx.fillRect(x0, y0, mw, mh)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.strokeRect(x0, y0, mw, mh)

    // Halfway line + center circle
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    ctx.moveTo(x0 + mw / 2, y0)
    ctx.lineTo(x0 + mw / 2, y0 + mh)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x0 + mw / 2, y0 + mh / 2, mh * 0.16, 0, Math.PI * 2)
    ctx.stroke()

    const mapX = (worldX) => x0 + ((worldX + this.fieldHalfLength) / (this.fieldHalfLength * 2)) * mw
    const mapY = (worldZ) => y0 + ((worldZ + this.fieldHalfWidth) / (this.fieldHalfWidth * 2)) * mh

    // Camera frustum cone (so the player can see what's in their view)
    this._drawFrustumIndicator(ctx, mapX(ballPos.x), mapY(ballPos.z))

    // Power-ups (drawn before kickers so kickers sit on top)
    for (const pu of powerUps) {
      if (pu.collected) continue
      const wp = pu.root.position
      const x = mapX(wp.x), y = mapY(wp.z)
      ctx.fillStyle = colorHex(pu.type.color, 1)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Kickers
    for (const k of kickers) {
      if (k.isAlive && !k.isAlive()) continue
      const p = k.body.translation()
      const danger = k.isThreatening?.() ?? false
      ctx.fillStyle = danger ? '#ff3030' : '#ff7060'
      const x = mapX(p.x)
      const y = mapY(p.z)
      ctx.beginPath()
      ctx.arc(x, y, danger ? 4 : 3, 0, Math.PI * 2)
      ctx.fill()
      if (danger) {
        ctx.strokeStyle = '#ff3030'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // Ball (white, drawn last so it's on top)
    const bx = mapX(ballPos.x)
    const by = mapY(ballPos.z)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(bx, by, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  _drawFrustumIndicator(ctx, bx, by) {
    // Yaw of camera from its forward vector
    this.camera.getWorldDirection(this._tmpVec)
    const yaw = Math.atan2(this._tmpVec.x, this._tmpVec.z)  // world XZ
    // Minimap +Y (down on canvas) corresponds to world +Z; +X canvas → +X world.
    // Cone direction in canvas space: x = sin(yaw), y = cos(yaw)
    const len = 28
    const fov = Math.PI / 4
    const dirX = Math.sin(yaw)
    const dirY = Math.cos(yaw)
    const leftAng = yaw - fov
    const rightAng = yaw + fov
    const lx = bx + Math.sin(leftAng) * len
    const ly = by + Math.cos(leftAng) * len
    const rx = bx + Math.sin(rightAng) * len
    const ry = by + Math.cos(rightAng) * len

    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(lx, ly)
    ctx.lineTo(rx, ry)
    ctx.closePath()
    ctx.fill()
    void dirX; void dirY
  }

  dispose() {
    window.removeEventListener('resize', this._resize)
    this.canvas.remove()
  }
}

function colorHex(num, alpha = 1) {
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
