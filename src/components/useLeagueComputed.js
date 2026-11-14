import { useMemo } from 'react';
import { computeLeague } from '../lib/league/season.js';
import { defaultLeagueSettings, normalizeSettings } from '../lib/league/format.js';

// League settings (with defaults filled in) plus every round's results and the standings.
export function useLeagueComputed(data) {
  return useMemo(() => {
    if (!data) return null;
    const settings = normalizeSettings({ ...defaultLeagueSettings(), ...data.league.settings });
    return { settings, ...computeLeague({ settings, members: data.members, events: data.events, scores: data.scores }) };
  }, [data]);
}
