import { BallEngine } from './BallEngine.js'
import { Kicker } from '../games/common/Kicker.js'
import { HudOverlay } from '../hud/HudOverlay.js'
import { PowerUpManager, POWERUP } from '../games/common/PowerUp.js'
import { Effects } from '../games/common/Effects.js'

const STARTING_LIVES = 3
const MAX_LIVES_CAP = 5
const HIGHSCORE_KEY_PREFIX = 'ballpov_highscore_v2_'

const SCORE = {
  PER_SECOND: 1,
  DODGE:      25,
  PICKUP:     50,
  KILL:       150,
}

const PALETTE = [0xc0392b, 0x2980b9, 0x8e44ad, 0xe67e22, 0x16a085, 0xc0a020, 0xd35400, 0x6c5ce7, 0xff4f81, 0x00b894]

/**
 * Shared game shell: engine init, ball, kickers, hud, scoring, lives, hit
 * detection, power-ups, audio. Each sport subclasses this and only provides
 * the arena, enemy/ball overrides, and a few constants.
 */
export class BaseGame {
  static id = 'base'
  static label = '🟢 Base'

  constructor({ onGameOver } = {}) {
    this.onGameOver = onGameOver
    this.engine = new BallEngine(this.engineConfig())
    this.disposed = false
  }

  // ---------- Hooks for subclasses ----------

  /** Engine-level rendering settings (sky, fog, gravity). */
  engineConfig() {
    return {
      sky: 0x87ceeb,
      fog: { color: 0x87ceeb, near: 60, far: 180 },
      ambient: 0x445544,
      gravity: { x: 0, y: -18, z: 0 },
    }
  }

  arenaBounds() { return { halfLength: 40, halfWidth: 25 } }

  /** Real-world ball radius/mass per sport. Override in subclass. */
  ballSpec() { return { radius: 0.11, mass: 0.43, restitution: 0.5, friction: 1.0 } }

  /** Camera distance/height/fov; should scale with ball radius. */
  cameraConfig() {
    const r = this.ballSpec().radius
    // Default: chase distance ≈ 25× radius, capped to feel right
    const distance = Math.min(6, Math.max(2.0, r * 25))
    const height = distance * 0.45
    return {
      fov: 72,
      distance,
      height,
      lookHeight: r * 4,
      near: Math.max(0.005, r * 0.1),
      minY: r * 1.5,
    }
  }

  /** Build environment meshes + colliders. Must call this.engine.scene/world. */
  buildArena() { /* override */ }

  /** Override to tweak ball look/physics for the sport. */
  configureBall() { /* override */ }

  /** Per-step hook for game-specific logic (terrain, custom entities). */
  _extraStep(dt) { /* override */ }

  initialEnemyCount() { return 3 }
  maxEnemies()        { return 100 }
  spawnIntervalStart(){ return 8 }
  spawnIntervalMin()  { return 2.5 }

  /** Y of the surface the ball plays on. Override for raised surfaces (table tennis). */
  groundY() { return 0 }
  /** Seconds between staggered initial spawns. */
  initialSpawnGap() { return 1.8 }
  /** Delay before the first enemy spawns (gives the player a moment to orient). */
  initialSpawnDelay() { return 1.5 }

  defaultWeapon() { return 'foot' }
  hintText()      { return 'WASD move · Space jump · Shift sprint · C camera · M mute' }

  enemyConfig(timeAlive, idx) {
    return {
      speed: 3.2 + Math.min(2.8, timeAlive * 0.04),
      windupTime: Math.max(0.22, 0.55 - timeAlive * 0.005),
      kickPower: 12 + Math.min(8, timeAlive * 0.08),
      weapon: this.defaultWeapon(),
      color: PALETTE[(idx + Math.floor(Math.random() * 3)) % PALETTE.length],
      approachAngle: Math.random() * Math.PI * 2,
    }
  }

  /** Best-effort initial spawn point for enemies, far from ball spawn. */
  enemySpawnPosition(idx) {
    const { halfLength, halfWidth } = this.arenaBounds()
    // Spread initial enemies evenly around a ring far from center
    const ang = (idx / Math.max(1, this.initialEnemyCount())) * Math.PI * 2
    const r = Math.max(halfWidth * 0.7, 8)
    return {
      x: Math.cos(ang) * r,
      z: Math.sin(ang) * r * (halfWidth / halfLength),
    }
  }

  // ---------- Lifecycle ----------

  async start() {
    await this.engine.init(this.ballSpec())
    this.engine.cameraRig.configure(this.cameraConfig())
    this.engine.ball.setGroundY(this.groundY())
    this.audio = this.engine.audio
    this.audio.resume()
    this.audio.startMusic()
    this.audio.setRollPlaying(true)

    this.bounds = this.arenaBounds()
    // dynamicProps must exist before buildArena() — sport arenas push props.
    this.dynamicProps = []
    this.buildArena()

    this.configureBall()
    this._spawnBallSafe()

    this.kickers = []
    // Stagger initial spawns — one player drops in at a time so the field
    // doesn't materialise all at once.
    this._initialSpawnQueue = []
    for (let i = 0; i < this.initialEnemyCount(); i++) this._initialSpawnQueue.push(i)
    this._initialSpawnTimer = this.initialSpawnDelay()

    this.hud = new HudOverlay({
      camera: this.engine.cameraRig.camera,
      fieldHalfLength: this.bounds.halfLength,
      fieldHalfWidth: this.bounds.halfWidth,
    })

    this.effects = new Effects(this.engine.ball)
    this.powerUps = new PowerUpManager(this.engine.scene, {
      spawnInterval: 9,
      maxActive: 3,
      bounds: this.bounds,
      canSpawnHeart: () => this.lives < MAX_LIVES_CAP,
    })

    this.lives = STARTING_LIVES
    this.maxLives = MAX_LIVES_CAP
    const prev = readHighScore(this._hsKey())
    this.highScore = prev.score
    this.highScoreName = prev.name
    this.playerName = (localStorage.getItem('ball_player_name') || '').trim()
    this.score = 0
    this.kills = 0
    this.dodges = 0
    this.timeAlive = 0
    this.timeAliveAccum = 0
    this.spawnTimer = 0
    this.spawnInterval = this.spawnIntervalStart()
    this.invulnTimer = 0
    this.lastBallEnergy = 0
    this.bigKickThreshold = 8
    this.gameOver = false

    this.hudEl = {
      lives:    document.getElementById('hud-lives'),
      score:    document.getElementById('hud-score'),
      hi:       document.getElementById('hud-hi'),
      time:     document.getElementById('hud-time'),
      kickers:  document.getElementById('hud-kickers'),
      kills:    document.getElementById('hud-kills'),
      dodges:   document.getElementById('hud-dodges'),
      stamina:  document.getElementById('hud-stamina'),
      effects:  document.getElementById('effects-bar'),
      sport:    document.getElementById('hud-sport'),
      player:   document.getElementById('hud-player-name'),
    }
    if (this.hudEl.sport) this.hudEl.sport.textContent = this.constructor.label
    if (this.hudEl.player) this.hudEl.player.textContent = this.playerName || 'PLAYER'
    this.hudEl.effects?.classList.add('visible')
    this._renderHudPills()

    const hint = document.getElementById('controls-hint')
    if (hint) hint.textContent = this.hintText()

    this.engine.onStep = (dt) => this._step(dt)
    this.engine.onRender = () => this._render()
    this.engine.start()
  }

  _hsKey() { return HIGHSCORE_KEY_PREFIX + this.constructor.id }

  // ---------- Helpers ----------

  _spawnBallSafe() {
    const ball = this.engine.ball
    const spawnY = this.groundY() + ball.radius + 0.3
    // Always spawn at the exact center of the arena. Initial enemies are
    // already placed far away on the perimeter ring (enemySpawnPosition),
    // so center is guaranteed safe.
    ball.body.setTranslation({ x: 0, y: spawnY, z: 0 }, true)
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  _spawnKicker(idx) {
    if (this._aliveKickers().length >= this.maxEnemies()) return
    const cfg = this.enemyConfig(this.timeAlive ?? 0, idx ?? this.kickers?.length ?? 0)
    cfg.spawnPos = cfg.spawnPos ?? (idx != null ? this.enemySpawnPosition(idx) : null)
    cfg.bounds = this.bounds
    const k = new Kicker(this.engine.scene, this.engine.world, cfg)
    this.kickers.push(k)
  }

  _aliveKickers() { return this.kickers.filter(k => k.isAlive()) }

  _step(dt) {
    if (this.gameOver) return
    this.timeAlive += dt
    this.invulnTimer = Math.max(0, this.invulnTimer - dt)

    // Process the staggered initial spawn queue
    if (this._initialSpawnQueue.length > 0) {
      this._initialSpawnTimer -= dt
      if (this._initialSpawnTimer <= 0) {
        const idx = this._initialSpawnQueue.shift()
        this._spawnKicker(idx)
        this._initialSpawnTimer = this.initialSpawnGap()
      }
    }

    // Ground safety net: if the ball ever falls below the playing surface
    // (numerical glitch, off the table tennis table, etc.), respawn it on
    // a safe spot.
    const ballPosNow = this.engine.ball.position()
    if (ballPosNow.y < this.groundY() - 0.4) {
      this._spawnBallSafe()
    }

    this.timeAliveAccum += dt
    while (this.timeAliveAccum >= 1) {
      this.timeAliveAccum -= 1
      this._awardScore(SCORE.PER_SECOND)
    }

    const wasFire = this.effects.has('fire')
    this.effects.update(dt)
    const isFire = this.effects.has('fire')
    if (wasFire !== isFire) this.audio?.setFirePlaying(isFire)

    const ballSpeed = this.engine.ball.speed()
    if (this.engine.ball.grounded) this.audio?.updateRoll(ballSpeed)
    else this.audio?.updateRoll(0)

    if (this.engine.ball.consumeJumped?.()) this.audio?.sfx.jump()
    const landMag = this.engine.ball.consumeLanded?.()
    if (landMag > 0) this.audio?.sfx.land()

    // Auto-dribble (basketball): periodic vertical hops while moving
    if (this.engine.ball._autoDribble) {
      this._dribbleAccum = (this._dribbleAccum || 0) + dt
      const speed = this.engine.ball.speed()
      if (speed > 0.6 && this.engine.ball.grounded) {
        const period = 0.5 - Math.min(0.25, speed * 0.025)
        if (this._dribbleAccum >= period) {
          this._dribbleAccum = 0
          const m = this.engine.ball.body.mass()
          this.engine.ball.body.applyImpulse({ x: 0, y: 3.5 * m, z: 0 }, true)
        }
      } else {
        this._dribbleAccum = 0
      }
    }

    this.powerUps.update(dt)
    const ballPos = this.engine.ball.position()
    const pickupRadius = this.engine.ball.radius + 0.7
    const picked = this.powerUps.pickupAt(ballPos, pickupRadius)
    if (picked) this._collectPowerUp(picked)

    const v = this.engine.ball.velocity()

    for (const k of this.kickers) {
      const wasState = k.state
      k.update(dt, ballPos, v, this.engine.ball.body, this.kickers,
        (_, hit) => this._onKickResolved(hit))
      if (wasState !== 'wind_up' && k.state === 'wind_up') this.audio?.sfx.windupAlert()
      if (wasState !== 'kick' && k.state === 'kick') this.audio?.sfx.kickWhoosh()
    }

    if (this.effects.has('fire')) {
      const reach = this.engine.ball.radius + 0.55
      for (const k of this.kickers) {
        if (!k.isAlive()) continue
        const kp = k.position()
        const d = Math.hypot(kp.x - ballPos.x, kp.z - ballPos.z)
        if (d < reach) this._eliminateKicker(k)
      }
    }

    if (this._aliveKickers().length < this.maxEnemies()) {
      this.spawnTimer += dt
      const target = Math.max(this.spawnIntervalMin(), this.spawnInterval - this.timeAlive * 0.04)
      if (this.spawnTimer >= target) {
        this.spawnTimer = 0
        this._spawnKicker()
      }
    }

    this.kickers = this.kickers.filter(k => {
      if (k.state === 'eliminated' && k.stateTime > 1.4) {
        k.dispose()
        return false
      }
      return true
    })

    // Hit detection: surge in horizontal energy. Y is intentionally ignored
    // so jumps (especially the long-jump power-up) don't register as kicks.
    const energy = Math.hypot(v.x, v.z)
    if (energy - this.lastBallEnergy > this.bigKickThreshold && this.invulnTimer <= 0) {
      this._takeHit()
    }
    this.lastBallEnergy = energy

    // Game-specific per-step hook (terrain effects, custom entities, etc.)
    this._extraStep(dt)
  }

  _collectPowerUp(p) {
    p.collect()
    this.powerUps.remove(p)
    this._awardScore(SCORE.PICKUP)

    if (p.type === POWERUP.HEART) {
      const before = this.lives
      this.lives = Math.min(this.maxLives, this.lives + 1)
      if (this.lives > before) this.audio?.sfx.heartPickup?.()
      else this.audio?.sfx.pickup()
    } else if (p.type === POWERUP.SHOCKWAVE) {
      this._triggerShockwave()
      this.audio?.sfx.pickup()
    } else {
      this.effects.add(p.type.id, p.type.duration || 0)
      this.audio?.sfx.pickup()
    }
    this._showPickupToast(p.type)
    this._renderHudPills()
    this._renderEffectsBar()
  }

  _triggerShockwave() {
    const ballPos = this.engine.ball.position()
    const radius = 8
    for (const k of this.kickers) {
      if (!k.isAlive()) continue
      const kp = k.position()
      const d = Math.hypot(kp.x - ballPos.x, kp.z - ballPos.z)
      if (d < radius) {
        if (d < 4) this._eliminateKicker(k)
        else {
          const dx = (kp.x - ballPos.x) / (d || 1)
          const dz = (kp.z - ballPos.z) / (d || 1)
          k.body.setNextKinematicTranslation({ x: kp.x + dx * 4, y: 1.0, z: kp.z + dz * 4 })
          k.kickCooldown = 1.5
        }
      }
    }
    this._screenFlash('rgba(192, 132, 252, 0.4)')
    this.audio?.sfx.shockwave()
  }

  _eliminateKicker(k) {
    if (!k.isAlive()) return
    k.eliminate()
    this.kills += 1
    this._awardScore(SCORE.KILL)
    this.audio?.sfx.kill()
  }

  _render() {
    if (this.gameOver) return
    const ballPos = this.engine.ball.position()
    // Sync dynamic prop transforms from physics
    for (const p of this.dynamicProps) {
      if (!p.body) continue
      const t = p.body.translation()
      const r = p.body.rotation()
      p.root.position.set(t.x, t.y, t.z)
      p.root.quaternion.set(r.x, r.y, r.z, r.w)
    }
    this.hud.render(ballPos, this.kickers, this.powerUps.items)
    this.hudEl.time.textContent = this.timeAlive.toFixed(1).padStart(5, '0') + 's'
    this.hudEl.stamina.textContent = String(Math.round(this.engine.ball.stamina * 100)).padStart(3, '0') + '%'
    this.hudEl.kickers.textContent = `${String(this._aliveKickers().length).padStart(2, '0')}↑`
    this._renderEffectsBar()
  }

  _onKickResolved(hit) {
    if (!hit) {
      this.dodges += 1
      this._awardScore(SCORE.DODGE)
      this.audio?.sfx.dodge()
      this._renderHudPills()
    }
  }

  _awardScore(n) {
    this.score += n
    if (this.hudEl?.score) {
      this.hudEl.score.textContent = padScore(this.score)
      this.hudEl.score.classList.toggle('beat-hi', this.score > this.highScore)
      if (this.hudEl.hi) this.hudEl.hi.textContent = padScore(Math.max(this.highScore, this.score))
    }
  }

  _takeHit() {
    if (this.effects.consume('shield')) {
      this.invulnTimer = 1.0
      this._screenFlash('rgba(103, 232, 249, 0.45)')
      this.audio?.sfx.dodge()
      this._renderEffectsBar()
      return
    }
    this.lives = Math.max(0, this.lives - 1)
    this.invulnTimer = 0.9
    this._screenFlash('rgba(255, 60, 60, 0.35)')
    this.audio?.sfx.hit()
    this._renderHudPills()
    if (this.lives <= 0) this._endGame()
    else if (this.lives < this.maxLives && Math.random() < 0.4) {
      this.powerUps.spawnHeart()
    }
  }

  _screenFlash(color) {
    const flash = document.createElement('div')
    flash.style.cssText =
      `position:fixed;inset:0;background:${color};pointer-events:none;z-index:9;transition:opacity 0.5s;`
    document.body.appendChild(flash)
    requestAnimationFrame(() => {
      flash.style.opacity = '0'
      setTimeout(() => flash.remove(), 600)
    })
  }

  _showPickupToast(type) {
    const t = document.createElement('div')
    t.textContent = `+${type.label}`
    t.style.cssText = `
      position:fixed;left:50%;top:35%;transform:translate(-50%,-50%);
      background:rgba(0,0,0,0.7);color:#fff;padding:0.6rem 1.1rem;
      border-radius:8px;font-size:1.1rem;font-weight:600;z-index:9;
      pointer-events:none;transition:opacity 0.6s, transform 0.6s;
      border:1px solid rgba(255,255,255,0.25);
    `
    document.body.appendChild(t)
    requestAnimationFrame(() => {
      t.style.transform = 'translate(-50%,-100%)'
      t.style.opacity = '0'
      setTimeout(() => t.remove(), 700)
    })
  }

  _renderHudPills() {
    const filled = '♥'.repeat(this.lives)
    const empty = '♡'.repeat(this.maxLives - this.lives)
    this.hudEl.lives.textContent = filled + empty
    this.hudEl.lives.classList.toggle('low', this.lives === 1)

    this.hudEl.score.textContent = padScore(this.score)
    this.hudEl.score.classList.toggle('beat-hi', this.score > this.highScore)
    if (this.hudEl.hi) this.hudEl.hi.textContent = padScore(Math.max(this.highScore, this.score))

    this.hudEl.time.textContent = this.timeAlive.toFixed(1).padStart(5, '0') + 's'
    this.hudEl.kickers.textContent = `${String(this._aliveKickers().length).padStart(2, '0')}↑`
    this.hudEl.kills.textContent = String(this.kills).padStart(2, '0')
    this.hudEl.dodges.textContent = String(this.dodges).padStart(2, '0')
    this.hudEl.stamina.textContent = String(Math.round(this.engine.ball.stamina * 100)).padStart(3, '0') + '%'
  }

  _renderEffectsBar() {
    const bar = this.hudEl.effects
    if (!bar) return
    const list = this.effects.list()
    if (list.length === 0) { bar.innerHTML = ''; return }
    bar.innerHTML = list.map(e => {
      const meta = Object.values(POWERUP).find(p => p.id === e.id)
      const label = meta ? meta.label : e.id
      const barHtml = e.progress != null
        ? `<div class="bar"><div style="width:${(e.progress * 100).toFixed(0)}%"></div></div>` : ''
      return `<div class="effect ${e.id}">${label}${barHtml}</div>`
    }).join('')
  }

  _endGame() {
    this.gameOver = true
    this.engine.stop()
    this.audio?.setRollPlaying(false)
    this.audio?.setFirePlaying(false)
    this.audio?.stopMusic()
    this.audio?.sfx.gameOver()

    const newHigh = this.score > this.highScore
    if (newHigh) {
      this.highScore = this.score
      this.highScoreName = this.playerName || 'PLAYER'
      try {
        localStorage.setItem(this._hsKey(), JSON.stringify({
          score: this.highScore, name: this.highScoreName,
        }))
      } catch {}
    }
    this.onGameOver?.({
      title: newHigh ? 'NEW HIGH SCORE' : 'KICKED OUT',
      timeAlive: this.timeAlive,
      dodges: this.dodges,
      score: this.score,
      highScore: this.highScore,
      highScoreName: this.highScoreName,
      playerName: this.playerName,
      newHigh,
      kills: this.kills,
    })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.kickers?.forEach(k => k.dispose())
    this.kickers = []
    if (this.dynamicProps) {
      for (const p of this.dynamicProps) {
        try {
          p.scene.remove(p.root)
          if (p.body) p.world.removeRigidBody(p.body)
        } catch {}
      }
      this.dynamicProps = []
    }
    this.powerUps?.dispose()
    this.effects?.dispose()
    this.hud?.dispose()
    this.engine?.dispose()
    if (this.hudEl?.effects) {
      this.hudEl.effects.classList.remove('visible')
      this.hudEl.effects.innerHTML = ''
    }
  }
}

function padScore(n) {
  return String(Math.max(0, Math.floor(n))).padStart(7, '0')
}

function readHighScore(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return { score: 0, name: '' }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object') {
      return { score: +parsed.score || 0, name: parsed.name || '' }
    }
    return { score: +parsed || 0, name: '' }
  } catch {
    return { score: +raw || 0, name: '' }
  }
}

export { PALETTE, MAX_LIVES_CAP, STARTING_LIVES }
