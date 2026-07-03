import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "events";

/**
 * CLI model pin (spec 2026-07-03, criterion B1).
 *
 * `runClaude` must pass an explicit `--model claude-opus-4-8` so extraction
 * quality does not drift with the environment's Claude CLI default model
 * (NAS Docker vs dev machine).
 */

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({ spawn: spawnMock }));

import { runClaude } from "@/lib/claude-cli";

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn();
  return child;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("runClaude model pin", () => {
  it("B1: spawns claude with --model claude-opus-4-8", async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runClaude("hello");
    child.stdout.emit("data", JSON.stringify({ type: "result", result: "ok" }));
    child.emit("close", 0);

    await expect(promise).resolves.toBe("ok");

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1] as string[];
    const modelFlag = args.indexOf("--model");
    expect(modelFlag).toBeGreaterThan(-1);
    expect(args[modelFlag + 1]).toBe("claude-opus-4-8");
  });
});
