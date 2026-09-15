import { z } from "zod";

// Shared actions schema: scripted browser steps executed in order on a page.
// (Ported from the Beledarian reference; per-action required fields are
// enforced at execution time by executeBrowserActions with clear errors.)
export const BrowserActionSchema = z.object({
  type: z.enum(["wait_for_selector", "wait", "click", "type", "press", "select", "hover", "scroll", "evaluate"]),
  selector: z.string().optional().describe("CSS selector used by selector-based actions."),
  text: z.string().optional().describe("Text payload for type action."),
  value: z.string().optional().describe("Value payload for select action."),
  key: z.string().optional().describe("Keyboard key for press action (e.g., Enter, Tab)."),
  milliseconds: z.number().int().min(0).max(30000).optional().describe("Delay in milliseconds for wait action."),
  x: z.number().optional().describe("Horizontal scroll delta for scroll action."),
  y: z.number().optional().describe("Vertical scroll delta for scroll action."),
  script: z.string().optional().describe("JavaScript snippet for evaluate action (executed in page context)."),
});

export const BrowserSessionOpenArgsSchema = z.object({
  url: z.string(),
  wait_for_selector: z.string().optional().describe("Optional selector to wait for after navigation."),
  include_page_text: z.boolean().optional().describe("If true (default), returns full page text content after opening."),
});

export const BrowserSessionControlArgsSchema = z.object({
  actions: z.array(BrowserActionSchema).optional().describe("Optional scripted browser actions to execute on the active page."),
  read_page: z.boolean().optional().describe("If true (default), returns page metadata. Full text is returned only on URL change or when full_read=true."),
  full_read: z.boolean().optional().describe("If true, forces full page text output even when URL has not changed."),
  screenshot_path: z.string().optional().describe("Optional screenshot output path (must be within an allowed directory)."),
  full_page_screenshot: z.boolean().optional().describe("If true, captures full page screenshot."),
  fuzzy_find: z.string().optional().describe("Optional fuzzy-find query for in-page content/selectors."),
  max_results: z.number().int().min(1).max(20).optional().describe("Max fuzzy results to return (default: 5)."),
});

export const BrowserSessionCloseArgsSchema = z.object({});

export const BrowserOpenPageArgsSchema = z.object({
  url: z.string(),
  screenshot_path: z.string().optional().describe("Path to save a screenshot (e.g., 'screenshot.png'); must be within an allowed directory."),
  wait_for_selector: z.string().optional().describe("CSS selector to wait for before returning."),
  full_page_screenshot: z.boolean().optional().describe("If true, captures the full page when taking a screenshot."),
  actions: z.array(BrowserActionSchema).optional().describe("Optional scripted browser steps to run after navigation."),
});
