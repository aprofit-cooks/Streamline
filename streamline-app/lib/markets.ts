export interface Market {
  id: string;
  question: string;
  probability: number | null;
  volume?: number;
  url: string;
  platform: 'Polymarket' | 'Manifold' | 'Kalshi' | 'Metaculus';
  isRealMoney: boolean;
}

// ─── Relevance filtering ──────────────────────────────────────────────────────

function extractKeywords(topic: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'in', 'on', 'at', 'to', 'of',
    'with', 'by', 'about', 'is', 'are', 'will', 'be', 'its', 'has', 'this',
    'that', 'from', 'into', 'over', 'after', 'before', 'between', 'any',
  ]);
  return topic
    .toLowerCase()
    .split(/[\s,\-\/\(\)]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function isRelevant(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function abortAfter(ms: number): AbortSignal {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return ac.signal;
}

// ─── Manifold Markets ─────────────────────────────────────────────────────────

export async function searchManifold(query: string): Promise<Market[]> {
  try {
    const url = `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(query)}&limit=8&filter=open`;
    const res = await fetch(url, { next: { revalidate: 300 }, signal: abortAfter(2500) });
    if (!res.ok) return [];

    const data: any[] = await res.json();
    const keywords = extractKeywords(query);

    return data
      .filter((m) => m.outcomeType === 'BINARY' && m.probability != null)
      .filter((m) => isRelevant(m.question, keywords))
      .sort((a, b) => (b.totalLiquidity || 0) - (a.totalLiquidity || 0))
      .slice(0, 3)
      .map((m) => ({
        id: m.id,
        question: m.question,
        probability: m.probability,
        volume: m.volume,
        url: m.url,
        platform: 'Manifold' as const,
        isRealMoney: false,
      }));
  } catch {
    return [];
  }
}

// ─── Polymarket (real-money) ──────────────────────────────────────────────────

export async function searchPolymarket(query: string): Promise<Market[]> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?search=${encodeURIComponent(query)}&active=true&limit=12`;
    const res = await fetch(url, { next: { revalidate: 300 }, signal: abortAfter(2500) });
    if (!res.ok) return [];

    const data: any[] = await res.json();
    const keywords = extractKeywords(query);

    return data
      .filter((m) => isRelevant(m.question || '', keywords))
      .slice(0, 3)
      .map((m) => {
        let probability: number | null = null;
        try {
          const prices = JSON.parse(m.outcomePrices || '[]');
          probability = prices[0] != null ? parseFloat(prices[0]) : null;
        } catch {}
        return {
          id: String(m.id),
          question: m.question,
          probability,
          volume: m.volume ? parseFloat(m.volume) : undefined,
          url: `https://polymarket.com/event/${m.slug}`,
          platform: 'Polymarket' as const,
          isRealMoney: true,
        };
      })
      .filter((m) => m.probability !== null) as Market[];
  } catch {
    return [];
  }
}

// ─── Metaculus (broad topic coverage: tech, science, geopolitics, economy) ────

export async function searchMetaculus(query: string): Promise<Market[]> {
  try {
    const url = `https://www.metaculus.com/api2/questions/?search=${encodeURIComponent(query)}&status=open&forecast_type=binary&limit=8&order_by=-activity`;
    const res = await fetch(url, { next: { revalidate: 300 }, signal: abortAfter(2500) });
    if (!res.ok) return [];

    const data: { results: any[] } = await res.json();
    const keywords = extractKeywords(query);

    return (data.results || [])
      .filter((m) => isRelevant(m.title || '', keywords))
      .filter((m) => m.community_prediction?.q2 != null)
      .slice(0, 3)
      .map((m) => ({
        id: String(m.id),
        question: m.title,
        probability: m.community_prediction.q2,
        url: `https://www.metaculus.com${m.page_url}`,
        platform: 'Metaculus' as const,
        isRealMoney: false,
      }));
  } catch {
    return [];
  }
}

// ─── Combined ─────────────────────────────────────────────────────────────────

export async function searchAllMarkets(query: string): Promise<Market[]> {
  const [manifold, poly, metaculus] = await Promise.all([
    searchManifold(query),
    searchPolymarket(query),
    searchMetaculus(query),
  ]);

  // Real-money first, then by platform breadth
  const seen = new Set<string>();
  const combined: Market[] = [];

  for (const m of [...poly, ...metaculus, ...manifold]) {
    const key = m.question.toLowerCase().slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(m);
    }
  }

  return combined.slice(0, 5);
}
