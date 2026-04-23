import { describe, expect, it } from 'vitest'
import { parseCsv } from '../csvParser'

describe('parseCsv — header detection', () => {
  it('accepts the canonical headers', () => {
    const csv = `name,type,date,recurring,notes,photo_url
Jane,birthday,1990-03-15,true,"hi",`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })

  it('accepts headers with extra whitespace and mixed case', () => {
    const csv = `  Name , Type , Date , Recurring , Notes , Photo_URL
Jane,birthday,1990-03-15,true,,`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })

  it('accepts common header aliases (full_name, birthday)', () => {
    const csv = `full_name,birthday
Jane,1990-03-15`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[0]?.name).toBe('Jane')
    expect(r.rows[0]?.date).toBe('1990-03-15')
  })

  it('reports detected headers and aliases when no matching header row is found', () => {
    // event_date is a `date` alias — so we skip the name column on purpose here.
    const csv = `first_name,whatever
Jane,1990-03-15`
    const r = parseCsv(csv)
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
    const err = r.errors[0]!
    expect(err.row).toBe(1)
    expect(err.message).toMatch(/No header row found|Missing required column/)
    expect(err.message).toMatch(/Detected headers/)
    expect(err.message).toMatch(/first_name|firstname/)
  })

  it('strips BOM from first header', () => {
    const csv = `\uFEFFname,date
Jane,1990-03-15`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })
})

describe('parseCsv — preamble handling (Numbers/Excel exports)', () => {
  it('skips a "Table 1" title row and finds the real header', () => {
    const csv = `Table 1
name,type,date,recurring,notes,photo_url
Jane,birthday,1990-03-15,true,,
Bob,anniversary,2015-06-20,true,,`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]?.name).toBe('Jane')
  })

  it('skips title + blank separator rows', () => {
    const csv = `Table 1

,,,,,
name,type,date,recurring,notes,photo_url
Jane,birthday,1990-03-15,true,,`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })

  it('reports helpful error when NO header row is found', () => {
    const csv = `Summary
Totals: 42
Generated: today`
    const r = parseCsv(csv)
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]?.message).toMatch(/No header row found/)
    expect(r.errors[0]?.message).toMatch(/Numbers or Excel/)
  })

  it('redirects the user to the Attendance section when an attendance CSV is imported through the events parser', () => {
    const csv = `\uFEFFFirst Name,Last Name,Reserved + Checked-In
Alice,Jones,29
Bob,Smith,12`
    const r = parseCsv(csv)
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]?.message).toMatch(/looks like an ATTENDANCE export/i)
    expect(r.errors[0]?.message).toMatch(/Attendance → Import Attendance CSV/)
  })

  it('preserves 1-based row numbers in errors when preamble was skipped', () => {
    const csv = `Table 1
name,date
Jane,not-a-date`
    const r = parseCsv(csv)
    // Jane,not-a-date is on line 3 of the file (1-indexed)
    expect(r.errors[0]?.row).toBe(3)
  })
})

describe('parseCsv — row parsing', () => {
  it('trims whitespace from each field', () => {
    const csv = `name,type,date,recurring,notes,photo_url
  Jane  , birthday , 1990-03-15 , true ,  cake  ,`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[0]).toMatchObject({
      name: 'Jane',
      type: 'birthday',
      date: '1990-03-15',
      recurring: true,
      notes: 'cake'
    })
    expect(r.rows[0]?.photo_url).toBeUndefined()
  })

  it('accepts true/false, 1/0, yes/no for recurring', () => {
    const csv = `name,date,recurring
A,1990-01-01,true
B,1990-01-01,false
C,1990-01-01,1
D,1990-01-01,0
E,1990-01-01,yes
F,1990-01-01,no`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows.map((x) => x.recurring)).toEqual([true, false, true, false, true, false])
  })

  it('handles trailing commas for empty photo_url', () => {
    const csv = `name,type,date,recurring,notes,photo_url
Jane,birthday,1990-03-15,true,"loves cake",`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[0]?.photo_url).toBeUndefined()
  })

  it('handles rows that omit the trailing comma entirely', () => {
    const csv = `name,type,date,recurring,notes,photo_url
Jane,birthday,1990-03-15,true,"loves cake"`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[0]?.photo_url).toBeUndefined()
  })

  it('reports row number + offending line when date is malformed', () => {
    // A pure-garbage date — not YYYY-MM-DD, not MM/DD/YY, not MM/DD/YYYY.
    const csv = `name,date
Jane,not-a-date`
    const r = parseCsv(csv)
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
    const err = r.errors[0]!
    expect(err.row).toBe(2)
    expect(err.message).toMatch(/YYYY-MM-DD|MM\/DD\/YY/)
    expect(err.rawLine).toBe('Jane,not-a-date')
  })

  it('skips blank lines without raising errors', () => {
    const csv = `name,date
Jane,1990-03-15

Bob,1985-07-04

`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
  })

  it('reports an empty-file error for an empty string', () => {
    const r = parseCsv('')
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]?.message).toMatch(/empty/i)
  })

  it('handles quoted fields containing commas', () => {
    const csv = `name,date,notes
"Smith, Jane",1990-03-15,"likes cake, also pie"`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[0]?.name).toBe('Smith, Jane')
    expect(r.rows[0]?.notes).toBe('likes cake, also pie')
  })

  it('accepts MM/DD/YY dates in the standard format', () => {
    const csv = `name,date,type
Jane,3/15/90,birthday`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[0]?.date).toBe('1990-03-15')
  })
})

describe('parseCsv — ChalkItPro members export (TSV, two events per row)', () => {
  it('parses the ChalkItPro members export and produces 2 events per row', () => {
    const csv =
      'First Name\tLast Name\tBirth Date\tDays Until Birthday\tMember Since\tDays Until Anniversary\n' +
      'Adam\tSaad\t10/28/78\t191\t2/12/13\t298\n' +
      'Aleeza\tMoschella\t4/22/02\t2\t6/25/24\t67'
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(4)
    expect(r.rows[0]).toEqual({
      name: 'Adam Saad',
      type: 'birthday',
      date: '1978-10-28',
      recurring: true
    })
    expect(r.rows[1]).toEqual({
      name: 'Adam Saad',
      type: 'anniversary',
      date: '2013-02-12',
      recurring: true
    })
    expect(r.rows[2]).toEqual({
      name: 'Aleeza Moschella',
      type: 'birthday',
      date: '2002-04-22',
      recurring: true
    })
    expect(r.rows[3]).toEqual({
      name: 'Aleeza Moschella',
      type: 'anniversary',
      date: '2024-06-25',
      recurring: true
    })
  })

  it('pivots 2-digit years at 30: 00-29 → 20YY, 30-99 → 19YY', () => {
    const csv =
      'First Name\tLast Name\tBirth Date\n' +
      'Alex\tNewborn\t6/1/06\n' +
      'Old\tGuy\t6/1/76\n' +
      'Edge\tCase\t6/1/29\n' +
      'Pivot\tBoundary\t6/1/30'
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows.find((x) => x.name === 'Alex Newborn')?.date).toBe('2006-06-01')
    expect(r.rows.find((x) => x.name === 'Old Guy')?.date).toBe('1976-06-01')
    expect(r.rows.find((x) => x.name === 'Edge Case')?.date).toBe('2029-06-01')
    expect(r.rows.find((x) => x.name === 'Pivot Boundary')?.date).toBe('1930-06-01')
  })

  it('handles comma-separated ChalkItPro exports too', () => {
    const csv = `First Name,Last Name,Birth Date,Member Since
Adam,Saad,10/28/78,2/12/13`
    const r = parseCsv(csv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
  })

  it('reports a row error when a date cell is unparseable but keeps the valid one', () => {
    const csv =
      'First Name\tLast Name\tBirth Date\tMember Since\n' +
      'Test\tUser\tsome-garbage\t2/12/13'
    const r = parseCsv(csv)
    expect(r.rows).toHaveLength(1) // just the anniversary
    expect(r.rows[0]?.type).toBe('anniversary')
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]?.message).toMatch(/Birth Date/)
  })
})
