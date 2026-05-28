export interface Market {
  id: string;
  question: string;
  probability: number | null;
  volume?: number;
  url: string;
  platform: 'Polymarket' | 'Manifold' | 'Kalshi';
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

// ─── Manifold Markets (primary — free, public, semantically rich) ─────────────

export async function searchManifold(query: string): Promise<Market[]> {
  try {
    const url = `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(query)}&limit=8&filter=open`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];

    const data: any[] = await res.json();
    const keywords = extractKeywords(query);

    return data
      .filter((m) => m.outcomeType === 'BINARY' && m.probability != null)
      .filter((m) => isRelevant(m.question, keywords))
      .sort((a, b) => (b.totalLiquidity || 0) - (a.totalLiquidity || 0))
      .slice(0, 4)
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

// ─── Polymarket (real-money markets when available) ───────────────────────────

export async function searchPolymarket(query: string): Promise<Market[]> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?search=${encodeURIComponent(query)}&active=true&limit=12`;
    const res = await fetch(url, { next: { revalidate: 300 } });
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

// ─── Combined ─────────────────────────────────────────────────────────────────

export async function searchAllMarkets(query: string): Promise<Market[]> {
  const [manifold, poly] = await Promise.all([
    searchManifold(query),
    searchPolymarket(query),
  ]);

  // Dedupe by question similarity, real-money first
  const seen = new Set<string>();
  const combined: Market[] = [];

  for (const m of [...poly, ...manifold]) {
    const key = m.question.toLowerCase().slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(m);
    }
  }

  return combined.slice(0, 5);
}
