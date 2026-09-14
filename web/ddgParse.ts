// DuckDuckGo HTML parsing helpers — ported verbatim from the Beledarian plugin's
// web_search implementation (toolsProvider.ts, web_search section) so results match.

export type SearchProvider =
  | "duckduckgo-api"
  | "duckduckgo-fetch"
  | "duckduckgo-html"
  | "google"
  | "bing";

export type SearchResult = {
  title: string;
  link: string;
  snippet: string;
  provider: SearchProvider;
};

export const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

export const stripHtml = (value: string) =>
  decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeDuckDuckGoLink = (link: string): string => {
  const decoded = decodeHtmlEntities(link);
  const absolute = decoded.startsWith("//")
    ? `https:${decoded}`
    : decoded.startsWith("/")
      ? `https://duckduckgo.com${decoded}`
      : decoded;

  try {
    const parsed = new URL(absolute);
    const redirect = parsed.searchParams.get("uddg");
    if (redirect) {
      return decodeURIComponent(redirect);
    }
  } catch {
    // Return original normalized URL below.
  }

  return absolute;
};

export const parseDuckDuckGoHtml = (
  html: string,
  provider: "duckduckgo-fetch" | "duckduckgo-html"
): SearchResult[] => {
  const parsedResults: SearchResult[] = [];
  const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = titleRegex.exec(html)) !== null) {
    const link = normalizeDuckDuckGoLink(match[1]);
    const title = stripHtml(match[2]);
    const nearbyHtml = html.slice(match.index, Math.min(html.length, match.index + 1800));
    const snippetMatch = nearbyHtml.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";

    if (title && link) {
      parsedResults.push({ title, link, snippet, provider });
    }
    if (parsedResults.length >= 10) break;
  }

  return parsedResults;
};
