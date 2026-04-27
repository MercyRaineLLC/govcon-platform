// =============================================================
// mapSetAside coverage — locks in the SAM.gov enum audit (PROMPT §8.1 #8)
// so future edits to the matcher can't silently regress mappings.
// =============================================================
import { describe, it, expect } from 'vitest'
import { mapSetAside } from './samApi'

describe('mapSetAside — SAM.gov code path', () => {
  it.each([
    // Total / partial small business
    ['SBA',      'TOTAL_SMALL_BUSINESS'],
    ['SBP',      'SMALL_BUSINESS'],
    ['RSB',      'SMALL_BUSINESS'],

    // 8(a)
    ['8A',       'SBA_8A'],
    ['8AN',      'SBA_8A'],

    // SDVOSB (set-aside + sole-source)
    ['SDVOSBC',  'SDVOSB'],
    ['SDVOSBS',  'SDVOSB'],

    // VOSB (the previously-missing class — was falling to NONE)
    ['VSA',      'VOSB'],
    ['VSS',      'VOSB'],
    ['VOSB',     'VOSB'],

    // WOSB / EDWOSB
    ['WOSB',     'WOSB'],
    ['WOSBSS',   'WOSB'],
    ['EDWOSB',   'EDWOSB'],
    ['EDWOSBSS', 'EDWOSB'],

    // HUBZone (codes — were falling to NONE before the fix)
    ['HZC',      'HUBZONE'],
    ['HZS',      'HUBZONE'],

    // Indian / Buy Indian
    ['IEE',      'INDIAN'],
    ['BICIV',    'INDIAN'],
    ['ISBEE',    'INDIAN'],
  ])('maps %s -> %s', (code, expected) => {
    expect(mapSetAside(code)).toBe(expected)
  })
})

describe('mapSetAside — descriptive label fallback', () => {
  it.each([
    ['Total Small Business Set-Aside',                    'TOTAL_SMALL_BUSINESS'],
    ['Service-Disabled Veteran-Owned Small Business',     'SDVOSB'],
    ['Veteran-Owned Small Business',                      'VOSB'],
    ['Woman-Owned Small Business',                        'WOSB'],
    ['Economically Disadvantaged Women-Owned',            'EDWOSB'],
    ['HUBZone Set-Aside',                                 'HUBZONE'],
    ['Hub Zone',                                          'HUBZONE'],
    ['8(a) Set-Aside',                                    'SBA_8A'],
    ['Indian Economic Enterprise',                        'INDIAN'],
    ['Native American-Owned',                             'INDIAN'],
    ['Small Business Set-Aside',                          'SMALL_BUSINESS'],
  ])('maps %s -> %s', (label, expected) => {
    expect(mapSetAside(label)).toBe(expected)
  })

  // Specificity — EDWOSB must beat plain WOSB when both substrings are present
  it('prefers EDWOSB over WOSB when label contains both', () => {
    expect(mapSetAside('Economically Disadvantaged Women-Owned Small Business (EDWOSB)')).toBe('EDWOSB')
  })

  // Specificity — SDVOSB must beat plain VOSB
  it('prefers SDVOSB over VOSB when label contains service-disabled', () => {
    expect(mapSetAside('Service-Disabled Veteran-Owned Small Business')).toBe('SDVOSB')
  })
})

describe('mapSetAside — edge cases', () => {
  it('returns NONE for null / undefined / empty', () => {
    expect(mapSetAside(null)).toBe('NONE')
    expect(mapSetAside(undefined)).toBe('NONE')
    expect(mapSetAside('')).toBe('NONE')
  })

  it('returns NONE for unrecognized strings', () => {
    expect(mapSetAside('FULL_AND_OPEN')).toBe('NONE')
    expect(mapSetAside('xyz')).toBe('NONE')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(mapSetAside(' sba ')).toBe('TOTAL_SMALL_BUSINESS')
    expect(mapSetAside('hzc')).toBe('HUBZONE')
    expect(mapSetAside('8AN')).toBe('SBA_8A')
  })
})
