import type { Browser } from "puppeteer-core";
import fs from "fs";
import nodePath from "path";
import os from "os";

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
//
// Executable resolution (v0.2.29 publish portability):
//   1. env MCP_CHROME_PATH (explicit; must exist)
//   2. the standard puppeteer cache <home>/.cache/puppeteer/chrome/<build>/,
//      highest version wins (e.g. win64-142.0.7444.175/chrome-win64/chrome.exe)
//   3. the legacy hardcoded path (the reference machine's preinstall)
export const CHROME_PATH =
  "C:\\Users\\Gerar\\.cache\\puppeteer\\chrome\\win64-142.0.7444.175\\chrome-win64\\chrome.exe";

// Compare two "win64-<a.b.c.d>" build dirs numerically (ascending).
function compareBuildDirs(a: string, b: string): number {
  const pa = a.replace(/^win64-/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^win64-/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Resolve the Chrome-for-Testing executable (null when nothing is found).
export function resolveChromePath(): string | null {
  const env = process.env.MCP_CHROME_PATH;
  if (env && fs.existsSync(env)) return env;

  const base = nodePath.join(os.homedir(), ".cache", "puppeteer", "chrome");
  if (fs.existsSync(base)) {
    const builds = fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("win64-"))
      .map((e) => e.name)
      .sort(compareBuildDirs);
    for (let i = builds.length - 1; i >= 0; i--) {
      const p = nodePath.join(base, builds[i], "chrome-win64", "chrome.exe");
      if (fs.existsSync(p)) return p;
    }
  }

  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  return null;
}

const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

// Launch a fresh headless browser with the standard options.
export const launchBrowser = async (): Promise<Browser> => {
  const puppeteer = await import("puppeteer-core");
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error(
      "No Chrome-for-Testing executable found. Set MCP_CHROME_PATH to the path of chrome.exe, " +
        `or install a build under ${nodePath.join(os.homedir(), ".cache", "puppeteer", "chrome")} ` +
        "(standard layout: win64-<version>/chrome-win64/chrome.exe)."
    );
  }
  return puppeteer.launch({
    headless: true,
    executablePath: chromePath,
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
