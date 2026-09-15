import type { Browser } from "puppeteer-core";
import { validatePath } from "../helpers/path.js";
import { launchBrowser, closeBrowserQuiet } from "./launcher.js";
import { closeSession, getSession, setSession } from "./session.js";
import { executeBrowserActions, type BrowserAction } from "./browserActions.js";
import { rankFuzzyMatches } from "./fuzzySearch.js";

// In-page candidate collection for fuzzy find (ported from the Beledarian
// reference): interactive + text nodes, deduped on (text||selector), capped
// at 400 candidates. Runs inside the page context.
const collectFuzzyCandidates = (
  page: import("puppeteer-core").Page,
): Promise<Array<{ text: string; selector: string }>> =>
  page.evaluate(() => {
    const dedup = new Map<string, { text: string; selector: string }>();
    const nodes = document.querySelectorAll("a,button,input,textarea,select,[role='button'],[aria-label],h1,h2,h3,h4,h5,h6,p,span");

    const clean = (value: string) => value.replace(/\s+/g, " ").trim();
    const classSelector = (el: Element) => {
      const classes = Array.from(el.classList).slice(0, 2).map(c => c.replace(/[^a-zA-Z0-9_-]/g, ""));
      return classes.length > 0 ? `.${classes.join(".")}` : "";
    };

    const buildSelector = (el: Element) => {
      if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
      const name = el.getAttribute("name");
      if (name) return `${el.tagName.toLowerCase()}[name="${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
      return `${el.tagName.toLowerCase()}${classSelector(el)}`;
    };

    for (const node of nodes) {
      const element = node as HTMLElement;
      const text = clean(
        element.innerText ||
        (element as HTMLInputElement).value ||
        element.getAttribute("aria-label") ||
        "",
      );
      if (!text) continue;
      const selector = buildSelector(element);
      const key = `${text}||${selector}`;
      if (!dedup.has(key)) {
        dedup.set(key, { text: text.substring(0, 200), selector });
      }
      if (dedup.size >= 400) break;
    }

    return Array.from(dedup.values());
  });

// browser_session_open: launch (replacing any existing session), navigate,
// optionally wait for a selector, and optionally return full page text.
export async function handleBrowserSessionOpen(
  url: string,
  waitForSelector?: string,
  includePageText?: boolean,
): Promise<string> {
  try {
    if (getSession()) {
      await closeSession();
    }

    const browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 15000 });
      }
    } catch (error) {
      await closeBrowserQuiet(browser);
      throw error;
    }

    setSession({ browser, page, currentUrl: page.url() });

    const pageText = includePageText !== false
      ? await page.evaluate(() => document.body.innerText || "")
      : undefined;

    return JSON.stringify({
      success: true,
      session_active: true,
      url: page.url(),
      title: await page.title(),
      text_content: pageText,
      text_length: pageText ? pageText.length : 0,
      message: "Browser session opened.",
    });
  } catch (error) {
    return JSON.stringify({
      error: `Failed to open browser session: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// browser_session_control: run actions on the active page, optionally capture
// a screenshot, return page metadata (full text only on URL change or with
// full_read), and optionally fuzzy-find in-page text/selectors.
export async function handleBrowserSessionControl(
  args: {
    actions?: BrowserAction[];
    read_page?: boolean;
    full_read?: boolean;
    screenshot_path?: string;
    full_page_screenshot?: boolean;
    fuzzy_find?: string;
    max_results?: number;
  },
  allowedDirectories: string[],
): Promise<string> {
  const session = getSession();
  if (!session) {
    return JSON.stringify({
      error: "No active browser session. Call 'browser_session_open' first.",
    });
  }

  try {
    const beforeUrl = session.page.url();
    const actionLog = await executeBrowserActions(session.page, args.actions || []);
    const afterUrl = session.page.url();
    const urlChanged = beforeUrl !== afterUrl;
    session.currentUrl = afterUrl;

    let screenshotSaved = false;
    if (args.screenshot_path) {
      const screenshotFilePath = await validatePath(args.screenshot_path, allowedDirectories);
      await session.page.screenshot({ path: screenshotFilePath, fullPage: args.full_page_screenshot ?? false });
      screenshotSaved = true;
    }

    let pageSnapshot:
      | { url: string; title: string; text_content?: string; text_length?: number; note?: string }
      | undefined = undefined;
    if (args.read_page !== false) {
      const title = await session.page.title();
      if (urlChanged || args.full_read) {
        const textContent = await session.page.evaluate(() => document.body.innerText || "");
        pageSnapshot = {
          url: afterUrl,
          title,
          text_content: textContent,
          text_length: textContent.length,
        };
      } else {
        pageSnapshot = {
          url: afterUrl,
          title,
          note: "Full page text omitted (URL unchanged). Set full_read=true to force full output.",
        };
      }
    }

    let fuzzyResults: Array<{ text: string; selector: string; score: number }> = [];
    if (typeof args.fuzzy_find === "string" && args.fuzzy_find.trim()) {
      const query = args.fuzzy_find;
      const candidates = await collectFuzzyCandidates(session.page);
      const ranked = candidates
        .map(candidate => ({
          ...candidate,
          score: Math.max(
            rankFuzzyMatches(query, [candidate.text], 1)[0]?.score ?? 0,
            rankFuzzyMatches(query, [candidate.selector], 1)[0]?.score ?? 0,
          ),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, args.max_results ?? 5);

      fuzzyResults = ranked.map(item => ({
        text: item.text,
        selector: item.selector,
        score: item.score,
      }));
    }

    return JSON.stringify({
      success: true,
      session_active: true,
      actions_executed: actionLog,
      screenshot_saved: screenshotSaved,
      url_changed: urlChanged,
      url_change_notice: urlChanged ? `Url changed to -> [${afterUrl}]` : undefined,
      page: pageSnapshot,
      fuzzy_find_results: fuzzyResults,
    });
  } catch (error) {
    return JSON.stringify({
      error: `Browser session control failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// browser_session_close: tear down the active session (idempotent).
export async function handleBrowserSessionClose(): Promise<string> {
  if (!getSession()) {
    return JSON.stringify({
      success: true,
      session_active: false,
      message: "No active browser session.",
    });
  }

  try {
    await closeSession();
    return JSON.stringify({
      success: true,
      session_active: false,
      message: "Browser session closed.",
    });
  } catch (error) {
    return JSON.stringify({
      error: `Failed to close browser session: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// browser_open_page: stateless one-shot render (own browser instance, always
// closed on return; never touches the persistent session).
export async function handleBrowserOpenPage(
  args: {
    url: string;
    screenshot_path?: string;
    wait_for_selector?: string;
    full_page_screenshot?: boolean;
    actions?: BrowserAction[];
  },
  allowedDirectories: string[],
): Promise<string> {
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(args.url, { waitUntil: "networkidle0", timeout: 30000 });

      if (args.wait_for_selector) {
        await page.waitForSelector(args.wait_for_selector, { timeout: 10000 });
      }

      const beforeActionUrl = page.url();
      const actionLog = await executeBrowserActions(page, args.actions || []);
      const currentUrl = page.url();
      const urlChanged = currentUrl !== beforeActionUrl;

      const title = await page.title();
      const textContent = await page.evaluate(() => document.body.innerText || "");

      let screenshotSaved = false;
      if (args.screenshot_path) {
        const screenshotFilePath = await validatePath(args.screenshot_path, allowedDirectories);
        await page.screenshot({ path: screenshotFilePath, fullPage: args.full_page_screenshot ?? false });
        screenshotSaved = true;
      }

      return JSON.stringify({
        url: currentUrl,
        title,
        text_content: textContent.substring(0, 5000),
        screenshot_saved: screenshotSaved,
        actions_executed: actionLog,
        url_changed: urlChanged,
        url_change_notice: urlChanged ? `Url changed to -> [${currentUrl}]` : undefined,
      });
    } finally {
      await closeBrowserQuiet(browser);
    }
  } catch (error) {
    if (browser) {
      await closeBrowserQuiet(browser);
    }
    return JSON.stringify({
      error: `Browser operation failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
