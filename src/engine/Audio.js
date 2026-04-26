/**
 * Procedural audio engine. All sounds are synthesised live with the Web
 * Audio API — no asset files. Usable across any game in this project:
 *
 *   const audio = new AudioEngine()
 *   audio.resume()   // call from a user gesture
 *   audio.startMusic()
 *   audio.sfx.jump()
 */
export class AudioEngine {
  constructor() {
    this.ctx = null
    this.muted = false
    this.master = null
    this.sfxBus = null
    this.musicBus = null
    this.musicNodes = null
    this.rollNodes = null
    this.fireNodes = null
  }

  /** Must be called from a user-gesture handler the first time. */
  resume() {
    if (!this.ctx) this._build()
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.7
    this.master.connect(this.ctx.destination)
    this.sfxBus = this.ctx.createGain()
    this.sfxBus.gain.value = 1.0
    this.sfxBus.connect(this.master)
    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = 0.45
    this.musicBus.connect(this.master)

    this.sfx = new SfxBank(this)
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime + 0.1)
    }
    return this.muted
  }

  // -------- Music --------

  startMusic() {
    if (!this.ctx) this._build()
    if (this.musicNodes) return
    const ctx = this.ctx
    const t = ctx.currentTime

    // Slow A-minor pad with slight detune for warmth + LFO swell
    const chord = [110, 220, 277.18, 329.63, 440] // A2, A3, C#4(b), E4, A4 (close enough)
    const oscs = []
    const gains = []
    chord.forEach((freq, i) => {
      const o1 = ctx.createOscillator()
      o1.type = 'sine'
      o1.frequency.value = freq
      const o2 = ctx.createOscillator()
      o2.type = 'sine'
      o2.frequency.value = freq * 1.005    // slight detune
      const g = ctx.createGain()
      g.gain.value = 0.1 / Math.sqrt(i + 1)  // upper voices quieter
      o1.connect(g); o2.connect(g)
      g.connect(this.musicBus)
      o1.start(t); o2.start(t)
      oscs.push(o1, o2)
      gains.push(g)
    })

    // Slow LFO modulating gain for breathing pad
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.1
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.04
    lfo.connect(lfoGain)
    gains.forEach(g => lfoGain.connect(g.gain))
    lfo.start(t)

    // Subtle arpeggio on top — random low-volume blips
    const arpInterval = setInterval(() => {
      if (!this.musicNodes) return
      const notes = [440, 523.25, 659.25, 783.99]
      const n = notes[Math.floor(Math.random() * notes.length)]
      this._tone({ freq: n, freqEnd: n, dur: 0.6, type: 'triangle', volume: 0.05, bus: this.musicBus, attack: 0.05 })
    }, 1800)

    this.musicNodes = { oscs, gains, lfo, arpInterval }
  }

  stopMusic() {
    if (!this.musicNodes) return
    const t = this.ctx.currentTime
    this.musicNodes.gains.forEach(g => {
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(g.gain.value, t)
      g.gain.linearRampToValueAtTime(0, t + 0.6)
    })
    clearInterval(this.musicNodes.arpInterval)
    setTimeout(() => {
      this.musicNodes?.oscs.forEach(o => { try { o.stop() } catch {} })
      try { this.musicNodes?.lfo.stop() } catch {}
      this.musicNodes = null
    }, 700)
  }

  // -------- Continuous rolling sound --------

  /**
   * Continuous low-bandwidth noise that's modulated by the ball's speed.
   * Call updateRoll(speed) each frame; setRollPlaying(true/false) once.
   */
  setRollPlaying(on) {
    if (!this.ctx) this._build()
    if (on && !this.rollNodes) {
      const ctx = this.ctx
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      const src = ctx.createBufferSource()
      src.buffer = buf; src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 350
      filter.Q.value = 0.7
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(filter); filter.connect(g); g.connect(this.sfxBus)
      src.start()
      this.rollNodes = { src, filter, g }
    } else if (!on && this.rollNodes) {
      const t = this.ctx.currentTime
      this.rollNodes.g.gain.cancelScheduledValues(t)
      this.rollNodes.g.gain.linearRampToValueAtTime(0, t + 0.15)
      const nodes = this.rollNodes
      setTimeout(() => { try { nodes.src.stop() } catch {} }, 250)
      this.rollNodes = null
    }
  }

  updateRoll(speed) {
    if (!this.rollNodes) return
    const t = this.ctx.currentTime
    const target = Math.min(0.18, speed / 14 * 0.18)
    this.rollNodes.g.gain.linearRampToValueAtTime(target, t + 0.05)
    this.rollNodes.filter.frequency.linearRampToValueAtTime(280 + speed * 35, t + 0.05)
  }

  // Fire crackle loop while fire effect active
  setFirePlaying(on) {
    if (!this.ctx) this._build()
    if (on && !this.fireNodes) {
      const ctx = this.ctx
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      const src = ctx.createBufferSource()
      src.buffer = buf; src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'; filter.frequency.value = 1200
      const g = ctx.createGain(); g.gain.value = 0
      src.connect(filter); filter.connect(g); g.connect(this.sfxBus)
      src.start()
      const t = ctx.currentTime
      g.gain.linearRampToValueAtTime(0.12, t + 0.2)
      this.fireNodes = { src, g }
    } else if (!on && this.fireNodes) {
      const t = this.ctx.currentTime
      this.fireNodes.g.gain.linearRampToValueAtTime(0, t + 0.2)
      const nodes = this.fireNodes
      setTimeout(() => { try { nodes.src.stop() } catch {} }, 300)
      this.fireNodes = null
    }
  }

  // -------- Primitive synth helpers (also used by SfxBank) --------

  _tone({ freq = 440, freqEnd, dur = 0.2, type = 'sine', volume = 0.3, attack = 0.005, bus = null }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(volume, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(bus || this.sfxBus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  _noise({ dur = 0.2, freq = 1000, q = 1, type = 'bandpass', volume = 0.2, decay = true }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const N = Math.max(1, Math.floor(this.ctx.sampleRate * dur))
    const buf = this.ctx.createBuffer(1, N, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < N; i++) {
      d[i] = (Math.random() * 2 - 1) * (decay ? Math.pow(1 - i / N, 1.5) : 1)
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const filter = this.ctx.createBiquadFilter()
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(volume, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter); filter.connect(g); g.connect(this.sfxBus)
    src.start(t)
  }

  _chord(freqs, dur = 0.4, volume = 0.18, type = 'sine') {
    freqs.forEach(f => this._tone({ freq: f, dur, type, volume }))
  }
}

class SfxBank {
  constructor(audio) { this.a = audio }

  jump()      { this.a._tone({ freq: 380, freqEnd: 720, dur: 0.18, type: 'sine', volume: 0.22 }) }
  land()      { this.a._noise({ dur: 0.12, freq: 220, volume: 0.18, q: 0.7 }) }
  kickWhoosh(){ this.a._noise({ dur: 0.18, freq: 800, volume: 0.18, q: 0.9 }) }
  hit() {
    this.a._tone({ freq: 200, freqEnd: 80, dur: 0.3, type: 'square', volume: 0.32 })
    this.a._noise({ dur: 0.18, freq: 400, volume: 0.18 })
  }
  dodge()     { this.a._tone({ freq: 900, freqEnd: 1400, dur: 0.1, type: 'triangle', volume: 0.16 }) }
  pickup()    { this.a._chord([523.25, 659.25, 783.99], 0.3, 0.16, 'sine') }
  heartPickup() {
    // Rising arpeggio — classic 1-up
    const a = this.a
    const t0 = a.ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5]  // C E G C
    notes.forEach((f, i) => {
      setTimeout(() => a._tone({ freq: f, dur: 0.18, type: 'square', volume: 0.18 }), i * 80)
    })
    void t0
  }
  kill() {
    this.a._tone({ freq: 600, freqEnd: 80, dur: 0.3, type: 'square', volume: 0.28 })
    this.a._noise({ dur: 0.14, freq: 300, volume: 0.2 })
  }
  shockwave() {
    this.a._tone({ freq: 90, freqEnd: 25, dur: 0.7, type: 'sawtooth', volume: 0.45 })
    this.a._noise({ dur: 0.4, freq: 150, volume: 0.4, q: 0.5 })
  }
  windupAlert() { this.a._tone({ freq: 700, freqEnd: 1100, dur: 0.12, type: 'square', volume: 0.1 }) }
  uiClick()  { this.a._tone({ freq: 720, freqEnd: 540, dur: 0.06, type: 'sine', volume: 0.18 }) }
  gameOver() { this.a._chord([196, 165, 130.81], 0.9, 0.32, 'sawtooth') }
}
