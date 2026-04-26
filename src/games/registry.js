import { FootballGame } from './football/FootballGame.js'
import { CricketGame } from './cricket/CricketGame.js'
import { TennisGame } from './tennis/TennisGame.js'
import { GolfGame } from './golf/GolfGame.js'

export const GAMES = [
  FootballGame,
  CricketGame,
  TennisGame,
  GolfGame,
]

export function findGame(id) {
  return GAMES.find(g => g.id === id) || GAMES[0]
}
