import { kv } from '@vercel/kv';

// Edge runtime (not Node) — Web-standard Request/Response API instead of req/res.
export const config = { runtime: 'edge' };

// Self-owned, permanent analytics — independent of Vercel Analytics, which only
// retains a rolling 30-day window and dedupes "unique visitor" per time period
// on the free tier. This ledger never expires and is exact:
//
// POST { type: 'visit', visitorId: string }  -> records a page load + unique visitor + country
// POST { type: 'won' | 'lost' }               -> records a puzzle completion
// GET                                          -> returns full lifetime totals, including country breakdown

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(request: Request) {
  if (request.method === 'POST') {
    let body: { type?: string; visitorId?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid JSON body' }, 400);
    }

    if (body.type === 'visit') {
      if (!body.visitorId || typeof body.visitorId !== 'string') {
        return json({ error: 'visitorId required' }, 400);
      }
      try {
        // Vercel's edge network injects this header on every request — a
        // best-effort 2-letter country code (e.g. "US") derived from the
        // visitor's IP. Free, no external package or API call needed.
        const countryCode = request.headers.get('x-vercel-ip-country') || 'unknown';

        const [totalVisits] = await Promise.all([
          kv.incr('brief:visits:total'),
          kv.sadd('brief:visitors:unique', body.visitorId),
          kv.hincrby('brief:countries', countryCode, 1),
        ]);
        return json({ totalVisits, country: countryCode });
      } catch (err) {
        console.error('KV visit tracking failed:', err);
        return json({ error: 'tracking failed' }, 500);
      }
    }

    if (body.type === 'won' || body.type === 'lost') {
      try {
        const [total, specific] = await Promise.all([
          kv.incr('brief:completions:total'),
          kv.incr(`brief:completions:${body.type}`),
        ]);
        return json({ total, [body.type]: specific });
      } catch (err) {
        console.error('KV completion tracking failed:', err);
        return json({ error: 'tracking failed' }, 500);
      }
    }

    return json({ error: "type must be 'visit', 'won', or 'lost'" }, 400);
  }

  if (request.method === 'GET') {
    try {
      const [totalVisits, uniqueVisitors, completionsTotal, won, lost, countries] = await Promise.all([
        kv.get<number>('brief:visits:total'),
        kv.scard('brief:visitors:unique'),
        kv.get<number>('brief:completions:total'),
        kv.get<number>('brief:completions:won'),
        kv.get<number>('brief:completions:lost'),
        kv.hgetall<Record<string, number>>('brief:countries'),
      ]);
      const countryMap = countries ?? {};
      return json({
        totalVisits: totalVisits ?? 0,
        uniqueVisitors: uniqueVisitors ?? 0,
        completions: {
          total: completionsTotal ?? 0,
          won: won ?? 0,
          lost: lost ?? 0,
        },
        countries: {
          count: Object.keys(countryMap).length,
          breakdown: countryMap,
        },
      });
    } catch (err) {
      console.error('KV read failed:', err);
      return json({ error: 'read failed' }, 500);
    }
  }

  return json({ error: 'method not allowed' });
}
