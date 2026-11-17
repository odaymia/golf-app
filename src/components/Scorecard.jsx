import ScoreTable from './ScoreTable.jsx';

// A casual round's card in the shared scorecard look. Tap a score to go to
// that hole.
export default function Scorecard({ round, computed, onPickHole }) {
  const { holes } = round.course;
  const played = holes.findIndex((_, i) => round.players.some((p) => round.scores[p.id][i] == null));
  return (
    <section className="card sc-card">
      <ScoreTable
        holes={holes}
        marks
        now={played < 0 ? null : played}
        onHole={(h) => onPickHole(h + 1)}
        info={[{ key: 'i', name: 'Stroke index', values: holes.map((h) => h.hcp) }]}
        rows={round.players.map((p) => ({
          key: p.id,
          name: `${p.name} (${computed.playing[p.id]})`,
          values: round.scores[p.id],
          strokes: computed.strokes[p.id],
        }))}
      />
      <p className="hint">Dots are handicap strokes; the number after a name is their playing handicap. Tap a score to go to that hole.</p>
    </section>
  );
}
