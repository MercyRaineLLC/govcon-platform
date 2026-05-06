import { describe, it, expect } from 'vitest'
import { buildSyntheticNegatives } from './historicalBacktest'

const sdvosbWinner = {
  naics: ['541330'],
  sdvosb: true,
  wosb: false,
  hubzone: false,
  smallBiz: true,
}

const largeBizWinner = {
  naics: ['336411'],
  sdvosb: false,
  wosb: false,
  hubzone: false,
  smallBiz: false,
}

describe('buildSyntheticNegatives', () => {
  it('returns 0 negatives when count <= 0', () => {
    expect(buildSyntheticNegatives('541330', sdvosbWinner, 0)).toEqual([])
    expect(buildSyntheticNegatives('541330', sdvosbWinner, -1)).toEqual([])
  })

  it('produces 3 distinct mismatch variants by default', () => {
    const negs = buildSyntheticNegatives('541330', sdvosbWinner, 3)
    expect(negs).toHaveLength(3)
  })

  it('caps at 3 even when more requested (only 3 variants exist)', () => {
    const negs = buildSyntheticNegatives('541330', sdvosbWinner, 10)
    expect(negs).toHaveLength(3)
  })

  it('variant 1 has a different NAICS sector', () => {
    const negs = buildSyntheticNegatives('541330', sdvosbWinner, 1)
    expect(negs).toHaveLength(1)
    const sector = negs[0].naics[0].slice(0, 2)
    expect(sector).not.toBe('54')
  })

  it('variant 2 inverts the size-class flag', () => {
    const negs = buildSyntheticNegatives('541330', sdvosbWinner, 2)
    const v2 = negs[1]
    expect(v2.naics).toEqual(['541330']) // same NAICS as winner
    expect(v2.smallBiz).toBe(false) // flipped from winner
    // set-aside flags zeroed since they require small-biz
    expect(v2.sdvosb).toBe(false)
    expect(v2.wosb).toBe(false)
    expect(v2.hubzone).toBe(false)
  })

  it('variant 3 inverts set-aside flags but keeps NAICS + size', () => {
    const negs = buildSyntheticNegatives('541330', sdvosbWinner, 3)
    const v3 = negs[2]
    expect(v3.naics).toEqual(['541330'])
    expect(v3.smallBiz).toBe(true) // same as winner
    expect(v3.sdvosb).toBe(false) // flipped
    expect(v3.wosb).toBe(true) // flipped
    expect(v3.hubzone).toBe(true) // flipped
  })

  it('flips smallBiz correctly when winner is large-biz', () => {
    const negs = buildSyntheticNegatives('336411', largeBizWinner, 2)
    const v2 = negs[1]
    expect(v2.smallBiz).toBe(true) // flipped from large to small
  })

  it('handles missing/empty award NAICS without crashing', () => {
    const negs = buildSyntheticNegatives('', sdvosbWinner, 3)
    expect(negs).toHaveLength(3)
    // Variant 1 picks SOME distant sector even when current sector is missing
    expect(negs[0].naics[0]).not.toBe('')
  })
})
