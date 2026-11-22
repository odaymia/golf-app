// AI round recap: takes a round's facts (built in src/lib/roundRecap.js) and
// asks Claude for a short, funny write-up that hypes the best round and
// ribs whoever had a rough day.
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

Write 90-150 words in plain text (no markdown, no headings, no lists, no emoji spam; one or two emoji at most). Use the players' first names.
- Open with a punchy one-line headline sentence.
- Hype the best round: name real numbers (score to par, birdies, a great hole, money won).
- Roast whoever had the roughest day, playfully: blow-up holes, a bad nine, money lost. Keep it friendly trash talk between buddies, only about their golf. Never about looks, body, age, gender, race, religion, or anything personal. No profanity.
- Mention the money only if it is in the facts, and never invent payments.
- Only use facts you were given. Never invent shots, holes or scores.
- If some holes are unplayed, call it "so far".
- End with a short line inviting them to rate the course.`;

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
  try {
    ({ facts } = await req.json());
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const text = JSON.stringify(facts ?? null);
  const players = (facts as { players?: unknown[] })?.players;
  if (!Array.isArray(players) || players.length === 0 || players.length > 24 || text.length > 12000) {
    return json({ error: 'Nothing to recap yet.' }, 400);
  }

  // Daily cap per person (supabase/course_ratings.sql).
  const { data: ok, error: capError } = await supabase.rpc('claim_recap');
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
      system: SYSTEM,
      messages: [{ role: 'user', content: `Round facts (JSON):\n${text}\n\nWrite the recap.` }],
    } as never);
    if (msg.stop_reason === 'refusal') return json({ error: 'Couldn’t write a recap for this one.' }, 422);
    const recap = msg.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();
    if (!recap) return json({ error: 'Couldn’t write a recap. Try again.' }, 502);
    return json({ recap });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'The recap writer is busy. Try again in a minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Recaps aren’t set up yet (API key).' }, 500);
    console.error(e);
    return json({ error: 'Couldn’t write a recap. Try again.' }, 502);
  }
});
