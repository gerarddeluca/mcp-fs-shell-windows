import type { Browser } from "puppeteer-core";

// Chrome-for-Testing build 142.0.7444.175, preinstalled at
// C:\Users\Gerar\.cache\puppeteer (installed for the Beledarian browser tools;
// pairs with puppeteer 24.31). puppeteer-core is a pure-JS dependency (no
// browser download); ALL browser launches in this repo go through this single
// module so web_search's browser legs (duckduckgo-html / google / bing) and
// the browser_session_* / browser_open_page tools share one launcher:
//
//   * getSharedBrowser / closeSharedBrowser - the web_search shared browser
//     (module-level; one search call reuses a single instance across legs and
//     each leg closes it afterwards).
//   * launchBrowser - a fresh standalone instance (used by the persistent
//     browser session and the stateless browser_open_page one-shot).
//
// The persistent session (browser/session.ts) deliberately holds its OWN
// browser instance so web_search legs can never close it mid-session.

export const CHROME_PATH =
  "C:\\Users\\Gerar\\.cache\\puppeteer\\chrome\\win64-142.0.7444.175\\chrome-win64\\chrome.exe";

const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

// Launch a fresh headless browser with the standard options.
export const launchBrowser = async (): Promise<Browser> => {
  const puppeteer = await import("puppeteer-core");
  return puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: LAUNCH_ARGS,
  });
};

// Close a browser, swallowing already-closed errors.
export const closeBrowserQuiet = async (browser: Browser): Promise<void> => {
  try {
    await browser.close();
  } catch {
    // already closed
  }
};

let sharedBrowser: Browser | null = null;

// Shared browser used by the web_search browser legs. Lazily launched so a
// missing browser never breaks the non-puppeteer legs (errors surface per
// provider and are collected, not fatal).
export const getSharedBrowser = async (): Promise<Browser> => {
  if (!sharedBrowser) {
    sharedBrowser = await launchBrowser();
  }
  return sharedBrowser;
};

// Close and drop the shared browser so a later provider can relaunch cleanly
// (the reference kept a stale closed instance; nulling here is strictly safer
// for manual multi-provider mode).
export const closeSharedBrowser = async (): Promise<void> => {
  if (sharedBrowser) {
    const browser = sharedBrowser;
    sharedBrowser = null;
    await closeBrowserQuiet(browser);
  }
};
