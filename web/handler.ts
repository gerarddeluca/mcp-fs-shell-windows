import type { Browser } from "puppeteer-core";
import {
  parseDuckDuckGoHtml,
  type SearchProvider,
  type SearchResult,
} from "./ddgParse.js";

// Chrome-for-Testing build already verified on this machine by the Beledarian
// browser tools (puppeteer 24.31 pairs with Chrome 142.0.7444.175). puppeteer-core
// is used because it is pure JS (no browser download). Launch is lazy and provider
// errors are collected (not fatal), so a missing browser never breaks the
// non-puppeteer legs.
const CHROME_PATH =
  "C:\\Users\\Gerar\\.cache\\puppeteer\\chrome\\win64-142.0.7444.175\\chrome-win64\\chrome.exe";

let sharedBrowser: Browser | null = null;

const getBrowser = async (): Promise<Browser> => {
  if (!sharedBrowser) {
    const puppeteer = await import("puppeteer-core");
    sharedBrowser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return sharedBrowser;
};

// Close and drop the shared browser so a later provider can relaunch cleanly
// (the reference kept a stale closed instance; nulling here is strictly safer
// for manual multi-provider mode).
const closeSharedBrowser = async (): Promise<void> => {
  if (sharedBrowser) {
    const browser = sharedBrowser;
    sharedBrowser = null;
    try {
      await browser.close();
    } catch {
      // already closed
    }
  }
};

export async function handleWebSearch(
  query: string,
  providers?: SearchProvider[]
): Promise<string> {
  const results: SearchResult[] = [];
  const errors: string[] = [];
  const logs: string[] = [];

  const searchFunctions: Record<SearchProvider, (q: string) => Promise<SearchResult[]>> = {
    "duckduckgo-api": async (q: string) => {
      const ddg: any = await import("duck-duck-scrape");
      let attempt = 0;
      let lastError: unknown = null;

      while (attempt < 2) {
        try {
          const r = await ddg.search(q, { safeSearch: ddg.SafeSearchType.OFF });
          if (r.results && r.results.length > 0) {
            return r.results.slice(0, 10).map((result: any) => ({
              title: result.title,
              link: result.url,
              snippet: result.description,
              provider: "duckduckgo-api" as const,
            }));
          }
          break;
        } catch (e) {
          lastError = e;
          attempt++;
          await new Promise((res) => setTimeout(res, 1000));
        }
      }

      if (lastError) {
        throw lastError;
      }
      throw new Error("DuckDuckGo API returned no results");
    },

    "duckduckgo-fetch": async (q: string) => {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const extracted = parseDuckDuckGoHtml(html, "duckduckgo-fetch");
      if (extracted.length > 0) return extracted;
      throw new Error("No results parsed from DuckDuckGo HTML");
    },

    "duckduckgo-html": async (q: string) => {
      const browser = await getBrowser();
      try {
        const page = await browser.newPage();
        await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
          waitUntil: "networkidle2",
          timeout: 15000,
        });

        const html = await page.content();
        const extracted = parseDuckDuckGoHtml(html, "duckduckgo-html");
        if (extracted.length > 0) return extracted;
        throw new Error("No results found");
      } finally {
        await closeSharedBrowser();
      }
    },

    "google": async (q: string) => {
      const browser = await getBrowser();
      try {
        const page = await browser.newPage();
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(q)}`, {
          waitUntil: "networkidle2",
          timeout: 15000,
        });

        const extracted = await page.evaluate(() => {
          const items = document.querySelectorAll("div.g");
          const data: Array<{
            title: string;
            link: string;
            snippet: string;
            provider: "google";
          }> = [];
          for (const item of items) {
            const titleEl = item.querySelector("h3");
            const linkEl = item.querySelector("a");
            const snippetEl =
              item.querySelector('div[style*="-webkit-line-clamp"]') ||
              item.querySelector("div.VwiC3b");
            if (titleEl && linkEl) {
              data.push({
                title: titleEl.innerText,
                link: linkEl.getAttribute("href") || "",
                snippet: snippetEl ? (snippetEl as HTMLElement).innerText : "",
                provider: "google",
              });
            }
          }
          return data;
        });
        if (extracted.length > 0) return extracted.slice(0, 10);
        throw new Error("No results found");
      } finally {
        await closeSharedBrowser();
      }
    },

    "bing": async (q: string) => {
      const browser = await getBrowser();
      try {
        const page = await browser.newPage();
        await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, {
          waitUntil: "networkidle2",
          timeout: 15000,
        });

        const extracted = await page.evaluate(() => {
          const items = document.querySelectorAll("li.b_algo");
          const data: Array<{
            title: string;
            link: string;
            snippet: string;
            provider: "bing";
          }> = [];
          for (const item of items) {
            const titleEl = item.querySelector("h2 a");
            const linkEl = item.querySelector("h2 a");
            const snippetEl = item.querySelector("p");
            if (titleEl && linkEl) {
              data.push({
                title: (titleEl as HTMLElement).innerText,
                link: linkEl.getAttribute("href") || "",
                snippet: snippetEl ? (snippetEl as HTMLElement).innerText : "",
                provider: "bing",
              });
            }
          }
          return data;
        });
        if (extracted.length > 0) return extracted.slice(0, 10);
        throw new Error("No results found");
      } finally {
        await closeSharedBrowser();
      }
    },
  };

  if (providers && providers.length > 0) {
    for (const providerKey of providers) {
      try {
        logs.push(`[Manual] Attempting ${providerKey}...`);
        const pResults = await searchFunctions[providerKey](query);
        results.push(...pResults);
        logs.push(`[Manual] Success: ${providerKey} found ${pResults.length} results.`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push(`${providerKey}: ${errMsg}`);
        logs.push(`[Manual] Failed: ${providerKey} - ${errMsg}`);
      }
    }
  } else {
    const chain: SearchProvider[] = [
      "duckduckgo-fetch",
      "duckduckgo-api",
      "duckduckgo-html",
      "google",
      "bing",
    ];
    const browserProviders: SearchProvider[] = ["duckduckgo-html", "google", "bing"];
    let chromeUnavailable = false;

    for (let i = 0; i < chain.length; i++) {
      const providerKey = chain[i];
      if (chromeUnavailable && browserProviders.includes(providerKey)) {
        logs.push(`[Fallback Chain] Skipping ${providerKey}: Chrome not available on this system.`);
        continue;
      }
      const nextProvider = chain[i + 1];
      try {
        logs.push(`[Fallback Chain] Attempting ${providerKey}...`);
        const pResults = await searchFunctions[providerKey](query);
        results.push(...pResults);
        logs.push(`[Fallback Chain] Success: ${providerKey} found ${pResults.length} results. Stopping chain.`);
        break;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push(`${providerKey}: ${errMsg}`);
        if (/chrome|chromium/i.test(errMsg) && browserProviders.includes(providerKey)) {
          chromeUnavailable = true;
          logs.push(`[Fallback Chain] Failed: ${providerKey} - Chrome not available. Skipping all browser-based providers.`);
        } else {
          const nextMsg = nextProvider ? `Falling back to ${nextProvider}...` : "No more providers.";
          logs.push(`[Fallback Chain] Failed: ${providerKey} - ${errMsg}. ${nextMsg}`);
        }
      }
    }
  }

  if (results.length === 0) {
    return JSON.stringify({
      error: "All attempted search providers failed.",
      attempts: errors,
      trace: logs,
    });
  }

  const seenLinks = new Set<string>();
  const dedupedResults = results.filter((r) => {
    const key = r.link.trim();
    if (!key || seenLinks.has(key)) return false;
    seenLinks.add(key);
    return true;
  });

  return JSON.stringify({
    results: dedupedResults,
    meta: {
      total_found: dedupedResults.length,
      providers_used: [...new Set(dedupedResults.map((r) => r.provider))],
      no_api_key_required: true,
      trace: logs,
    },
  });
}

export async function handleFetchWebContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    let text = await response.text();

    const result: Record<string, unknown> = {
      url,
      status: response.status,
    };

    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1];

    const { compile } = await import("html-to-text");
    const compiledConvert = compile({
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
    });

    text = compiledConvert(text);

    result.content =
      text.substring(0, 40000) + (text.length > 40000 ? " (truncated)" : "");

    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({
      error: `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function handleWikipediaSearch(query: string, lang = "en"): Promise<string> {
  try {
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.query || !searchData.query.search || searchData.query.search.length === 0) {
      return JSON.stringify({ results: "No Wikipedia articles found." });
    }

    const results: Array<{ title: string; summary: string; url: string }> = [];
    for (const item of searchData.query.search.slice(0, 3)) {
      // Top 3
      const pageUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=${item.pageid}&format=json`;
      const pageResponse = await fetch(pageUrl);
      const pageData = await pageResponse.json();
      const page = pageData.query.pages[item.pageid];

      results.push({
        title: item.title,
        summary: page.extract.substring(0, 2000) + (page.extract.length > 2000 ? "..." : ""),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
      });
    }
    return JSON.stringify({ results });
  } catch (error) {
    return JSON.stringify({
      error: `Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
