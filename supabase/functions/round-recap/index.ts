// AI round recap: takes a round's facts (built in src/lib/roundRecap.js) and
// asks Claude for a short, funny write-up of the group's round, or (with
// `focus`, a player's name) one player's own round. League/tournament
// recaps are shared (eventId + groupKey) so each is written once.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
// name it "round-recap" and paste this file (or `supabase functions deploy
// round-recap`). Then Edge Functions -> Secrets -> add ANTHROPIC_API_KEY.
// Needs supabase/course_ratings.sql (claim_recap() caps recaps per person).
// The key lives only here, never in the app.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = `You write the post-round recap for a group of golfers in the Scribble Golf Club app, like a funny golf TV analyst at the 19th hole.

Write 120-200 words in plain text (no markdown, headings or lists; one or two emoji at most). Use first names.
- Open with a punchy one-line headline.
- Spread it around: give most players in the group a moment, not just first and last place. Look for the stories in each card: a birdie or eagle (even from someone who finished low), a hot or cold nine, a great hole, a blow-up hole, a run of bogeys, a big money swing, a close match.
- Hype the good stuff with real numbers. Roast the bad stuff playfully: friendly trash talk between buddies, only about their golf. Never about looks, body, age, gender, race, religion, or anything personal. No profanity.
- With a big group (6+), cover the 3-5 best stories instead of everyone.
- Mention money only if it is in the facts, and never invent payments.
- Only use facts you were given. Never invent shots, holes or scores.
- If some holes are unplayed, call it "so far".
- End with a short line inviting them to rate the course.`;

const PLAYER_SYSTEM = `You write one golfer's personal post-round recap in the Scribble Golf Club app, like a funny golf TV analyst talking straight to them at the 19th hole.

Write 70-120 words in plain text (no markdown, headings or lists; one emoji at most), speaking to the player as "you" by first name.
- Open with a punchy one-line verdict on their day.
- Hype their best moments with real numbers (birdies, a great hole, a good nine, money won, a match won).
- Roast their worst moments playfully (blow-up holes, a cold nine, bogey runs, money lost). Friendly trash talk only about their golf; never about looks, body, age, gender, race, religion, or anything personal. No profanity.
- You may compare them to others in the group, briefly.
- Only use facts you were given. Never invent shots, holes or scores. If holes are unplayed, call it "so far".
- End with one short line of encouragement or a tip for next time.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return json({ error: 'Sign in to get a recap.' }, 401);

  let facts: unknown;
  let eventId: string | undefined;
  let groupKey: string | undefined;
  let focus: string | undefined;
  try {
    ({ facts, eventId, groupKey, focus } = await req.json());
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const text = JSON.stringify(facts ?? null);
  const players = (facts as { players?: unknown[] })?.players;
  if (!Array.isArray(players) || players.length === 0 || players.length > 24 || text.length > 12000) {
    return json({ error: 'Nothing to recap yet.' }, 400);
  }
  // A personal recap names one player from the facts.
  if (focus != null && !players.some((p) => (p as { name?: string })?.name === focus)) {
    return json({ error: 'That player isn’t in this round.' }, 400);
  }

  // League/tournament rounds: one shared recap per foursome. If it's written,
  // hand it back (no charge); if a groupmate is writing it, say so.
  const shared = typeof eventId === 'string' && typeof groupKey === 'string' && groupKey.length > 0;
  if (shared) {
    const { data: st, error: stError } = await supabase.rpc('start_round_recap', { p_event: eventId, p_group: groupKey });
    if (stError) return json({ error: 'Recaps aren’t set up yet.' }, 500);
    if (st?.status === 'ready') return json({ recap: st.recap });
    if (st?.status === 'writing') return json({ writing: true });
    if (st?.status !== 'claimed') return json({ error: 'Only players in this league can get its recap.' }, 403);
  }
  const giveBack = () => (shared ? supabase.rpc('finish_round_recap', { p_event: eventId, p_group: groupKey, p_recap: null }) : null);

  // Daily cap per person (supabase/course_ratings.sql).
  const { data: ok, error: capError } = await supabase.rpc('claim_recap');
  if (capError || !ok) await giveBack();
  if (capError) return json({ error: 'Recaps aren’t set up yet.' }, 500);
  if (!ok) return json({ error: 'That’s enough recaps for today. Try again tomorrow.' }, 429);

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  try {
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: focus ? PLAYER_SYSTEM : SYSTEM,
      messages: [
        {
          role: 'user',
          content: focus
            ? `Round facts (JSON):\n${text}\n\nWrite ${focus}'s personal recap.`
            : `Round facts (JSON):\n${text}\n\nWrite the recap.`,
        },
      ],
    } as never);
    if (msg.stop_reason === 'refusal') {
      await giveBack();
      return json({ error: 'Couldn’t write a recap for this one.' }, 422);
    }
    const recap = msg.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();
    if (!recap) {
      await giveBack();
      return json({ error: 'Couldn’t write a recap. Try again.' }, 502);
    }
    if (shared) await supabase.rpc('finish_round_recap', { p_event: eventId, p_group: groupKey, p_recap: recap });
    return json({ recap });
  } catch (e) {
    await giveBack();
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'The recap writer is busy. Try again in a minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Recaps aren’t set up yet (API key).' }, 500);
    console.error(e);
    return json({ error: 'Couldn’t write a recap. Try again.' }, 502);
  }
});
