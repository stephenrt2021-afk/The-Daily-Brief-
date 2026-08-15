import { kv } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Self-owned, permanent analytics — independent of Vercel Analytics, which only
// retains a rolling 30-day window and dedupes "unique visitor" per time period
// on the free tier. This ledger never expires and is exact:
//
// POST { type: 'visit', visitorId: string }  -> records a page load + unique visitor
// POST { type: 'won' | 'lost' }               -> records a puzzle completion
// GET                                          -> returns full lifetime totals

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { type?: string; visitorId?: string };

    if (body.type === 'visit') {
      if (!body.visitorId || typeof body.visitorId !== 'string') {
        return res.status(400).json({ error: 'visitorId required' });
      }
      try {
        const [totalVisits] = await Promise.all([
          kv.incr('brief:visits:total'),
          kv.sadd('brief:visitors:unique', body.visitorId),
        ]);
        return res.status(200).json({ totalVisits });
      } catch (err) {
        console.error('KV visit tracking failed:', err);
        return res.status(500).json({ error: 'tracking failed' });
      }
    }

    if (body.type === 'won' || body.type === 'lost') {
      try {
        const [total, specific] = await Promise.all([
          kv.incr('brief:completions:total'),
          kv.incr(`brief:completions:${body.type}`),
        ]);
        return res.status(200).json({ total, [body.type]: specific });
      } catch (err) {
        console.error('KV completion tracking failed:', err);
        return res.status(500).json({ error: 'tracking failed' });
      }
    }

    return res.status(400).json({ error: "type must be 'visit', 'won', or 'lost'" });
  }

  if (req.method === 'GET') {
    try {
      const [totalVisits, uniqueVisitors, completionsTotal, won, lost] = await Promise.all([
        kv.get<number>('brief:visits:total'),
        kv.scard('brief:visitors:unique'),
        kv.get<number>('brief:completions:total'),
        kv.get<number>('brief:completions:won'),
        kv.get<number>('brief:completions:lost'),
      ]);
      return res.status(200).json({
        totalVisits: totalVisits ?? 0,
        uniqueVisitors: uniqueVisitors ?? 0,
        completions: {
          total: completionsTotal ?? 0,
          won: won ?? 0,
          lost: lost ?? 0,
        },
      });
    } catch (err) {
      console.error('KV read failed:', err);
      return res.status(500).json({ error: 'read failed' });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
