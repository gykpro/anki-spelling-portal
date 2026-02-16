import { spawn } from "child_process";
import { getConfig } from "./settings";

/**
 * Invoke the Claude Code CLI with a prompt piped via stdin.
 * Returns the parsed result text from the JSON output.
 */
export function runClaude(prompt: string, options?: {
  timeout?: number;
  maxBudget?: number;
  allowedTools?: string[];
}): Promise<string> {
  const { timeout = 120_000, maxBudget = 5, allowedTools } = options || {};

  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format", "json",
      "--max-budget-usd", String(maxBudget),
      "--permission-mode", "bypassPermissions",
      "--no-session-persistence",
    ];

    if (allowedTools) {
      args.push("--allowed-tools", ...allowedTools);
    }

    const spawnEnv: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "0" };
    const oauthToken = getConfig("CLAUDE_CODE_OAUTH_TOKEN");
    if (oauthToken) {
      spawnEnv["CLAUDE_CODE_OAUTH_TOKEN"] = oauthToken;
    }

    const child = spawn("claude", args, {
      env: spawnEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${timeout}ms`));
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const resultText = parsed.type === "result" ? parsed.result : stdout;
        resolve(resultText);
      } catch {
        // If JSON parse fails, return raw stdout
        resolve(stdout);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Pipe prompt via stdin
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Run Claude CLI and parse the result as JSON.
 * Strips markdown code fences if present.
 */
export async function runClaudeJSON<T = unknown>(prompt: string, options?: {
  timeout?: number;
  maxBudget?: number;
  allowedTools?: string[];
}): Promise<T> {
  const resultText = await runClaude(prompt, options);

  let jsonStr = resultText.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonStr);
}
