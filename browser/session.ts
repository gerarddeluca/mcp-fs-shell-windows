import type { Browser, Page } from "puppeteer-core";
import { closeBrowserQuiet } from "./launcher.js";

// ONE active session per fork process: a single {browser, page, currentUrl}
// pair held at module level. browser_session_open replaces any existing
// session (closing its browser first). browser_open_page is stateless (own
// browser, always closed on return) and never touches this.
// The session holds its own browser instance (not the web_search shared
// browser) so search legs can never close it mid-session.

export type BrowserSession = {
  browser: Browser;
  page: Page;
  currentUrl: string;
};

let session: BrowserSession | null = null;

export const getSession = (): BrowserSession | null => session;

export const setSession = (s: BrowserSession): void => {
  session = s;
};

// Close the active session's browser and drop the state. No-op when none.
export const closeSession = async (): Promise<void> => {
  if (session) {
    const s = session;
    session = null;
    await closeBrowserQuiet(s.browser);
  }
};
