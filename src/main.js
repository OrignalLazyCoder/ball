import { GAMES } from './games/registry.js'

const NAME_KEY = 'ball_player_name'
const HIGHSCORE_KEY_PREFIX = 'ballpov_highscore_v2_'

const menuEl = document.getElementById('menu')
const hudEl = document.getElementById('hud')
const hintEl = document.getElementById('controls-hint')
const crosshairEl = document.getElementById('crosshair')
const gameoverEl = document.getElementById('gameover')
const retryBtn = document.getElementById('go-retry')
const menuBtn = document.getElementById('go-menu')
const gameGrid = document.getElementById('game-grid')
const nameInput = document.getElementById('player-name')

let game = null
let lastGameClass = null

function getPlayerName() {
  return (localStorage.getItem(NAME_KEY) || '').trim()
}

function setPlayerName(n) {
  const cleaned = (n || '').trim().slice(0, 12).toUpperCase()
  if (cleaned) localStorage.setItem(NAME_KEY, cleaned)
  else localStorage.removeItem(NAME_KEY)
}

function readHighScore(gameId) {
  const raw = localStorage.getItem(HIGHSCORE_KEY_PREFIX + gameId)
  if (!raw) return null
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

function pad(n) { return String(Math.max(0, Math.floor(n))).padStart(7, '0') }

function buildGameGrid() {
  gameGrid.innerHTML = ''
  for (const G of GAMES) {
    const btn = document.createElement('button')
    btn.className = `game-tile ${G.id}`
    const [icon, ...rest] = G.label.split(' ')
    const hi = readHighScore(G.id)
    const hiHtml = hi && hi.score > 0
      ? `<span class="hi">HI <b>${pad(hi.score)}</b>${hi.name ? ` · ${hi.name}` : ''}</span>`
      : `<span class="hi">HI <b>${pad(0)}</b></span>`
    btn.innerHTML =
      `<span class="icon">${icon}</span>${rest.join(' ')}${hiHtml}`
    btn.addEventListener('click', () => startGame(G))
    gameGrid.appendChild(btn)
  }
}

function refreshNameInput() {
  nameInput.value = getPlayerName()
}

nameInput.addEventListener('input', () => {
  // Force uppercase + max length while typing
  const upper = nameInput.value.toUpperCase().slice(0, 12)
  if (nameInput.value !== upper) nameInput.value = upper
  setPlayerName(upper)
})
nameInput.addEventListener('blur', () => {
  setPlayerName(nameInput.value)
  refreshNameInput()
})

async function startGame(GameClass) {
  // Auto-fill a default name if the user didn't enter one
  if (!getPlayerName()) {
    setPlayerName('PLAYER')
    refreshNameInput()
  }

  lastGameClass = GameClass
  menuEl.style.display = 'none'
  gameoverEl.classList.remove('visible')
  hudEl.classList.add('visible')
  hintEl.classList.add('visible')
  crosshairEl.classList.add('visible')
  document.body.classList.add('in-game')

  game?.dispose()
  game = new GameClass({
    onGameOver: (stats) => {
      const newHigh = stats.newHigh
        ? '<div style="color:#fde047;font-size:1.1em;letter-spacing:0.3em;margin-bottom:0.4rem">★ NEW HI ★</div>' : ''
      const playerLine = stats.playerName
        ? `<div style="color:#a3e635;opacity:0.85;letter-spacing:0.25em;font-size:0.8em;margin-bottom:0.4rem">${stats.playerName}</div>`
        : ''
      document.getElementById('go-title').textContent = stats.title
      document.getElementById('go-stats').innerHTML =
        `${newHigh}${playerLine}` +
        `<div style="font-family:'Courier New',monospace;letter-spacing:0.18em;text-transform:uppercase">` +
          `<div style="color:#fde047;font-size:1.6em">${pad(stats.score)}</div>` +
          `<div style="color:#67e8f9;opacity:0.75;margin-top:0.3rem">HI ${pad(stats.highScore)}${stats.highScoreName ? ` · ${stats.highScoreName}` : ''}</div>` +
          `<div style="margin-top:0.8rem;color:#aaa">${stats.timeAlive.toFixed(1)}s · ${stats.dodges} eva · ${stats.kills} ko</div>` +
        `</div>`
      gameoverEl.classList.add('visible')
    },
  })
  try {
    await game.start()
  } catch (err) {
    console.error('Failed to start game', GameClass?.id, err)
    backToMenu()
  }
}

function backToMenu() {
  game?.dispose()
  game = null
  hudEl.classList.remove('visible')
  hintEl.classList.remove('visible')
  crosshairEl.classList.remove('visible')
  gameoverEl.classList.remove('visible')
  document.body.classList.remove('in-game')
  menuEl.style.display = 'flex'
  buildGameGrid()       // refresh HI scores after each game
  refreshNameInput()
}

retryBtn.addEventListener('click', () => {
  if (lastGameClass) startGame(lastGameClass)
})
menuBtn.addEventListener('click', backToMenu)

refreshNameInput()
buildGameGrid()

// ---------- Touch device setup ----------
const isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window)
if (isTouch) document.body.classList.add('touch')

// Wire touch action buttons. They dispatch into the active game's Input via
// the engine — but we don't have direct access here, so we forward through
// global window event helpers that Input listens to.
function bindTouchButton(selector, opts) {
  const btn = document.querySelector(selector)
  if (!btn) return
  const fire = (type) => {
    if (!game?.engine?.input) return
    const input = game.engine.input
    if (opts.kind === 'tap' && type === 'down') input.virtualTap(opts.code)
    if (opts.kind === 'hold') {
      if (type === 'down') input.virtualKeyDown(opts.code)
      else input.virtualKeyUp(opts.code)
    }
    if (opts.kind === 'hold' && opts.heldClass) {
      btn.classList.toggle(opts.heldClass, type === 'down')
    }
  }
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); fire('down') }, { passive: false })
  btn.addEventListener('touchend',   (e) => { e.preventDefault(); fire('up') },   { passive: false })
  btn.addEventListener('touchcancel',(e) => { e.preventDefault(); fire('up') },   { passive: false })
  btn.addEventListener('mousedown',  (e) => { e.preventDefault(); fire('down') })
  btn.addEventListener('mouseup',    (e) => { e.preventDefault(); fire('up') })
  btn.addEventListener('mouseleave', () => fire('up'))
}

bindTouchButton('.t-jump',   { kind: 'tap',  code: 'Space' })
bindTouchButton('.t-cam',    { kind: 'tap',  code: 'KeyC' })
bindTouchButton('.t-sprint', { kind: 'hold', code: 'ShiftLeft', heldClass: 'held' })
