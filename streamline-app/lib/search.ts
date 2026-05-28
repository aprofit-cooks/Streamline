export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

export async function searchNews(query: string, maxResults = 8, domainContext?: string): Promise<NewsItem[]> {
  try {
    // Append domain context only when the topic doesn't already contain it,
    // to avoid generic results when interests are niche (e.g. fashion, design).
    const contextualQuery = domainContext && !query.toLowerCase().includes(domainContext.toLowerCase())
      ? `${query} ${domainContext}`
      : query;
    const encoded = encodeURIComponent(contextualQuery + ' news');
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 StreamLine/1.0' },
      next: { revalidate: 900 },
    });

    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml).slice(0, maxResults);
  } catch {
    return [];
  }
}

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    items.push({
      title: cleanText(extractTag(item, 'title')),
      link: extractTag(item, 'link'),
      description: cleanText(extractTag(item, 'description')),
      pubDate: extractTag(item, 'pubDate'),
      source: extractTag(item, 'source'),
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  if (cdataMatch) return cdataMatch[1].trim();
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return plain ? plain[1].trim() : '';
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
