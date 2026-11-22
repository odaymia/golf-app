// Turn an OpenGolfAPI course into our course shape. Pure, no network.
// The data is community-maintained, so anything missing or odd is filled
// with a safe default and reported as a plain-English warning; the player
// can fix it in the holes editor before teeing off.
import { DEFAULT_HCPS } from './roundSetup.js';

export const ATTRIBUTION = '© OpenStreetMap contributors · contains data from OpenGolfAPI (opengolfapi.org) · ODbL 1.0';

export function courseIdFor(apiId) {
  return `oga-${apiId}`;
}

function validPar(p) {
  return Number.isInteger(p) && p >= 3 && p <= 6;
}

function isPermutation(list, n) {
  const seen = new Set(list);
  return list.length === n && seen.size === n && list.every((x) => Number.isInteger(x) && x >= 1 && x <= n);
}

export function courseFromApi(detail) {
  const warnings = [];
  const raw = (detail.holes_data ?? [])
    .filter((h) => Number.isInteger(h.number) && h.number >= 1 && h.number <= 18)
    .sort((a, b) => a.number - b.number);
  const nineHoles = detail.holes === 9 || (raw.length > 0 && raw.length <= 9);
  const count = nineHoles ? 9 : 18;
  const byNumber = new Map(raw.map((h) => [h.number, h]));

  let pars = Array.from({ length: count }, (_, i) => byNumber.get(i + 1)?.par);
  if (pars.some((p) => !validPar(p))) {
    warnings.push('Some pars were missing. Check them under Edit pars & hole handicaps.');
    pars = pars.map((p) => (validPar(p) ? p : 4));
  }

  let hcps = Array.from({ length: count }, (_, i) => byNumber.get(i + 1)?.handicap_index);
  if (!isPermutation(hcps, count)) {
    // Some cards list 18-hole stroke indexes on a 9-hole course; rank them.
    const ranked = hcps.every((x) => Number.isInteger(x)) && new Set(hcps).size === count;
    if (ranked) {
      const order = [...hcps].sort((a, b) => a - b);
      hcps = hcps.map((x) => order.indexOf(x) + 1);
    } else {
      warnings.push('Hole handicaps were missing or incomplete. Check them before you tee off.');
      hcps = nineHoles ? [5, 8, 2, 7, 1, 9, 3, 6, 4] : DEFAULT_HCPS.slice();
    }
  }

  let holes;
  if (nineHoles) {
    // Play the nine twice. Stroke index n on the card becomes 2n-1 going out
    // and 2n coming in, the usual way to handicap 18 on a 9-hole course.
    holes = [
      ...pars.map((par, i) => ({ par, hcp: hcps[i] * 2 - 1 })),
      ...pars.map((par, i) => ({ par, hcp: hcps[i] * 2 })),
    ];
    warnings.push('This is a 9-hole course, so it is set up to play the nine twice.');
  } else {
    holes = pars.map((par, i) => ({ par, hcp: hcps[i] }));
  }

  const totalPar = holes.reduce((s, h) => s + h.par, 0);
  const tees = [];
  let missingRating = false;
  for (const t of detail.tees ?? []) {
    let rating = Number(t.course_rating);
    let slope = Number(t.slope);
    if (!Number.isFinite(slope) || slope < 55 || slope > 155) slope = 113;
    if (!Number.isFinite(rating) || rating <= 0) {
      rating = totalPar;
      missingRating = true;
    } else if (nineHoles && rating < 50) {
      rating = Math.round(rating * 2 * 10) / 10; // 9-hole rating -> 18
    }
    const gender = t.gender === 'Female' ? ' (W)' : '';
    const yards = Number(t.yardage);
    tees.push({
      name: `${t.tee_name || t.tee_color || 'Tee'}${gender}`,
      rating,
      slope,
      ...(Number.isFinite(yards) && yards > 1000 ? { yards: Math.round(nineHoles && yards < 4500 ? yards * 2 : yards) } : {}),
    });
  }
  if (tees.length === 0) {
    tees.push({ name: 'White', rating: totalPar, slope: 113 });
    warnings.push('No tee ratings listed. Using par and slope 113; enter the real ones if you know them.');
  } else if (missingRating) {
    warnings.push('Some tees had no course rating, so par is used instead. Enter the real one if you know it.');
  }

  const place = [detail.city, detail.state].filter(Boolean).join(', ');
  return {
    course: {
      id: courseIdFor(detail.id),
      name: detail.course_name || detail.club_name || 'Course',
      place,
      holes,
      tees,
      source: { provider: 'opengolfapi', id: detail.id, attribution: ATTRIBUTION },
    },
    warnings,
  };
}
