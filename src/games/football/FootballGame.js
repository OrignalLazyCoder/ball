import { BaseGame, PALETTE } from '../../engine/BaseGame.js'
import { Field, FIELD_HALF_LENGTH, FIELD_HALF_WIDTH } from './Field.js'
import { makeBottle, makeCone, makeCornerFlag } from '../common/Props.js'

export class FootballGame extends BaseGame {
  static id = 'football'
  static label = '⚽ FOOTBALL'

  arenaBounds() { return { halfLength: FIELD_HALF_LENGTH, halfWidth: FIELD_HALF_WIDTH } }

  buildArena() {
    const scene = this.engine.scene, world = this.engine.world
    this.field = new Field(scene, world)

    // Corner flags
    const HL = FIELD_HALF_LENGTH - 1, HW = FIELD_HALF_WIDTH - 1
    this.dynamicProps.push(makeCornerFlag(scene, world, { x:  HL, z:  HW, color: 0xff3333 }))
    this.dynamicProps.push(makeCornerFlag(scene, world, { x:  HL, z: -HW, color: 0xff3333 }))
    this.dynamicProps.push(makeCornerFlag(scene, world, { x: -HL, z:  HW, color: 0xfde047 }))
    this.dynamicProps.push(makeCornerFlag(scene, world, { x: -HL, z: -HW, color: 0xfde047 }))

    // Sideline water bottles
    for (let i = -2; i <= 2; i++) {
      this.dynamicProps.push(makeBottle(scene, world, { x: i * 6, z: HW - 0.5, color: 0x66ccff }))
      this.dynamicProps.push(makeBottle(scene, world, { x: i * 6, z: -HW + 0.5, color: 0xff9933 }))
    }
    // Training cones in a small grid near center
    for (let i = -1; i <= 1; i++) {
      this.dynamicProps.push(makeCone(scene, world, { x: -15 + i * 1.6, z: 4 }))
    }
  }

  defaultWeapon() { return 'foot' }

  ballSpec() {
    return { radius: 0.11, mass: 0.43, restitution: 0.6, friction: 1.0 }
  }

  cameraConfig() {
    return { fov: 70, distance: 3.2, height: 1.4, lookHeight: 0.6, near: 0.02, minY: 0.2 }
  }

  configureBall() {
    this.engine.ball.setAppearance({
      color: 0xffffff,
      useFootballTexture: true,
      emissive: 0x222222,
      emissiveIntensity: 0.2,
      lightIntensity: 0.6,
    })
  }
}
