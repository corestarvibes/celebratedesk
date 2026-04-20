import { describe, expect, it } from 'vitest'
import { capitalizeName, parseAttendanceCsv } from '../attendanceCsvParser'

describe('attendanceCsvParser — capitalizeName', () => {
  it('capitalizes lowercase names', () => {
    expect(capitalizeName('kevin')).toBe('Kevin')
    expect(capitalizeName('  paula  ')).toBe('Paula')
  })
  it('handles hyphenated and apostrophe names', () => {
    expect(capitalizeName('mary-ann')).toBe('Mary-Ann')
    expect(capitalizeName("o'brien")).toBe("O'Brien")
  })
  it('handles multi-word names', () => {
    expect(capitalizeName('reed-pahang')).toBe('Reed-Pahang')
  })
  it('trims trailing spaces', () => {
    expect(capitalizeName('Friel ')).toBe('Friel')
  })
})

describe('attendanceCsvParser — parseAttendanceCsv', () => {
  it('parses the standard ChalkItPro export', () => {
    const csv = `\uFEFFFirst Name,Last Name,Reserved + Checked-In
Yianni,Papaspanos,29
Brianne,Reed-Pahang,26
kevin,friel ,18
paula,smith,12`
    const r = parseAttendanceCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(4)
    expect(r.rows[0]).toEqual({ firstName: 'Yianni', lastName: 'Papaspanos', count: 29 })
    // lowercase + trailing space
    expect(r.rows[2]).toEqual({ firstName: 'Kevin', lastName: 'Friel', count: 18 })
    expect(r.rows[3]).toEqual({ firstName: 'Paula', lastName: 'Smith', count: 12 })
  })

  it('strips BOM from header', () => {
    const csv = `\uFEFFFirst Name,Last Name,Check-Ins
A,B,5`
    const r = parseAttendanceCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })

  it('skips preamble rows (e.g. "Table 1")', () => {
    const csv = `Table 1

First Name,Last Name,Reserved + Checked-In
Alice,Jones,8`
    const r = parseAttendanceCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })

  it('reports a row error when count is not numeric', () => {
    const csv = `First Name,Last Name,Reserved + Checked-In
Alice,Jones,many`
    const r = parseAttendanceCsv(csv)
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]?.message).toMatch(/not a number/)
  })
})
