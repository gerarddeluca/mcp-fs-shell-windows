// analyze_project/handler.ts — project-wide linting (MCP filesystem fork).
//
// Port of the Beledarian analyze_project tool (beledarians-lm-studio-tools
// src/toolsProvider.ts). Detection ladder, exactly as the reference:
//   1. package.json with scripts.lint          -> npm run lint        (npm-script)
//   2. else eslint in (dev)dependencies       -> npx eslint . --format json (eslint)
//   3. else (only when package.json is absent/unreadable) any .py file -> pylint . (python-lint)
// The working directory is the shell_cwd default CWD (fork equivalent of the
// reference's currentWorkingDirectory).
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { getDefaultShellCwd } from "../shell/handler.js";

export async function handleAnalyzeProject(): Promise<string> {
  // Try to detect available linters
  const cwd = getDefaultShellCwd();
  const packageJsonPath = join(cwd, "package.json");
  let command = "";
  let type = "unknown";

  try {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    if (pkg.scripts && pkg.scripts.lint) {
      command = "npm run lint";
      type = "npm-script";
    } else if (pkg.devDependencies?.eslint || pkg.dependencies?.eslint) {
      command = "npx eslint . --format json"; // JSON for easier parsing? Or just text.
      type = "eslint";
    }
  } catch (e) {
    // check for python?
    const entries = await readdir(cwd);
    if (entries.some(f => f.endsWith(".py"))) {
      command = "pylint ."; // Assuming pylint is in path
      type = "python-lint";
    }
  }

  if (!command) {
    return JSON.stringify({ error: "Could not detect a supported linter (ESLint script or Python)." });
  }

  try {
    const child = spawn(command, {
      shell: true,
      cwd,
      timeout: 60000
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);

    await new Promise<void>((resolve) => child.on("close", () => resolve()));

    return JSON.stringify({
      tool: command,
      type,
      report: (stdout + stderr).substring(0, 10000) // Limit size
    });
  } catch (e) {
    return JSON.stringify({ error: `Analysis failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}
