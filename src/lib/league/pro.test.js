import { describe, it, expect } from 'vitest';
import { splitLine, parseRoster, splitNew, seasonDates, toCSV, standingsRows } from './pro.js';
import { leagueSettings } from './format.js';

describe('roster import', () => {
  it('splits quoted CSV', () => {
    expect(splitLine('"Smith, John",12.4,"1234"', ',')).toEqual(['Smith, John', '12.4', '1234']);
    expect(splitLine('"He said ""hi"""', ',')).toEqual(['He said "hi"']);
  });

  it('pasted from a spreadsheet with headers in any order', () => {
    const text =
      'Team\tPlayer\tEmail\tGHIN #\tHandicap\nEagles\tMike Jones\tMIKE@x.com\t1234567\t4.2\nHawks\tDave Lee\t\t\t+1.5\n';
    expect(parseRoster(text)).toEqual({
      players: [
        { name: 'Mike Jones', email: 'mike@x.com', index: 4.2, ghinNumber: '1234567', team: 'Eagles' },
        { name: 'Dave Lee', email: '', index: -1.5, ghinNumber: '', team: 'Hawks' },
      ],
      problems: [],
    });
  });

  it('first and last name columns', () => {
    const { players } = parseRoster('First,Last,Index\nSam,Snead,10\n');
    expect(players).toEqual([{ name: 'Sam Snead', email: '', index: 10, ghinNumber: '', team: '' }]);
  });

  it('no header: name, index, GHIN, team; an email can be in any column', () => {
    const { players } = parseRoster('Omar, 9.4, 111\nJoe, joe@x.com, 12\n');
    expect(players.map((p) => [p.name, p.email, p.index, p.ghinNumber])).toEqual([
      ['Omar', '', 9.4, '111'],
      ['Joe', 'joe@x.com', 12, ''],
    ]);
  });

  it('reports bad handicaps and blank names, keeps the rest', () => {
    const { players, problems } = parseRoster('Name,Index\nMike,abc\n,12\nDave,8\n');
    expect(players.map((p) => [p.name, p.index])).toEqual([
      ['Mike', null],
      ['Dave', 8],
    ]);
    expect(problems).toEqual([
      { line: 2, message: 'Mike: handicap "abc" isn’t a number'.replace('’', "'") },
      { line: 3, message: 'No name' },
    ]);
  });

  it('skips players already on the roster and repeats in the paste', () => {
    const { fresh, dupes } = splitNew(
      [{ name: 'Mike Jones' }, { name: 'mike jones' }, { name: 'New Guy' }, { name: 'Other', email: 'TAKEN@x.com' }],
      [{ name: 'Mike Jones ' }, { name: 'Someone', inviteEmail: 'taken@x.com' }],
    );
    expect(fresh.map((p) => p.name)).toEqual(['New Guy']);
    expect(dupes).toHaveLength(3);
  });
});

describe('season dates', () => {
  it('weekly, across months and a DST change', () => {
    expect(seasonDates('2026-10-27', 3)).toEqual(['2026-10-27', '2026-11-03', '2026-11-10']);
    expect(seasonDates('2027-03-09', 2)).toEqual(['2027-03-09', '2027-03-16']);
    expect(seasonDates('2026-12-29', 2, 14)).toEqual(['2026-12-29', '2027-01-12']);
    expect(seasonDates('2026-06-01', 0)).toEqual([]);
  });
});

describe('CSV export', () => {
  it('quotes what Excel needs quoted', () => {
    expect(toCSV([['Name', 'Note'], ['Smith, John', 'said "hi"'], ['A', null]])).toBe(
      'Name,Note\n"Smith, John","said ""hi"""\nA,',
    );
  });

  it('league points standings', () => {
    const s = leagueSettings({ season: 'points' });
    const rows = standingsRows(s, [
      { name: 'Mike', played: 3, points: 50, position: 1 },
      { name: 'Dave', played: 3, points: 40.5, position: 2 },
      { name: 'Sam', played: 2, points: 40.5, position: 2 },
    ]);
    expect(rows).toEqual([
      ['Pos', 'Name', 'Rounds', 'Points'],
      ['1', 'Mike', 3, 50],
      ['T2', 'Dave', 3, 40.5],
      ['T2', 'Sam', 2, 40.5],
    ]);
  });

  it('tournament stroke leaderboard with rounds', () => {
    const s = leagueSettings({ kind: 'tournament' });
    const rows = standingsRows(
      s,
      [{ name: 'Mike', position: 1, started: true, toPar: -3, rounds: [{ value: 70 }, { value: 71 }] }],
      [{ name: 'Round 1' }, { name: 'Round 2' }],
    );
    expect(rows).toEqual([
      ['Pos', 'Name', 'To par', 'Round 1', 'Round 2'],
      ['1', 'Mike', '-3', 70, 71],
    ]);
  });
});
