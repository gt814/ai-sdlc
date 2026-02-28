import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { NormalizedTask, RunOptions, RunResult } from "../src/domain/types";
import { OpenClawWorkflowTest } from "../src/testing/openclaw-workflow-test/OpenClawWorkflowTest";
import type { OpenClawAdapter, ConfigValidationResult } from "../src/runtime/OpenClawAdapter";

class FakeAdapter implements OpenClawAdapter {
  constructor(
    private readonly runImpl: (task: NormalizedTask, options: RunOptions) => Promise<RunResult>,
    private readonly validation: ConfigValidationResult = { valid: true, errors: [] }
  ) {}

  readonly stateDirs: string[] = [];
  runCalls = 0;

  async runTask(task: NormalizedTask, options: RunOptions): Promise<RunResult> {
    this.runCalls += 1;
    this.stateDirs.push(options.stateDir);
    return this.runImpl(task, options);
  }

  async validateConfig(_configPath: string): Promise<ConfigValidationResult> {
    void _configPath;
    return this.validation;
  }

  async cleanup(_stateDir: string): Promise<void> {
    void _stateDir;
    return Promise.resolve();
  }
}

const cleanupPaths: string[] = [];

afterEach(async () => {
  for (const path of cleanupPaths) {
    await rm(path, { recursive: true, force: true });
  }
  cleanupPaths.length = 0;
});

function successResult(options: RunOptions): RunResult {
  return {
    success: true,
    finalState: "ReadyForReview",
    checks: [
      { name: "analysis", status: "passed" },
      { name: "tests", status: "passed" }
    ],
    artifactsDir: options.stateDir,
    logsPath: join(options.stateDir, "run.log")
  };
}

describe("OpenClawWorkflowTest", () => {
  test("happy path reaches ReadyForReview and keeps artifacts when requested", async () => {
    const dockerAdapter = new FakeAdapter(async (_task, options) => {
      await mkdir(options.stateDir, { recursive: true });
      await writeFile(join(options.stateDir, "run.log"), "ok", "utf8");
      await writeFile(join(options.stateDir, "test-results.md"), "all green", "utf8");
      return successResult(options);
    });

    const workflow = new OpenClawWorkflowTest({
      dockerAdapter,
      cliAdapter: new FakeAdapter(async (_task, options) => successResult(options)),
      keepState: true
    });

    const result = await workflow.run(join(process.cwd(), "src/testing/fixtures/tasks/example-task.json"));
    workflow.assertSuccess(result);

    const log = await readFile(result.logsPath, "utf8");
    const summary = await readFile(join(result.artifactsDir, "test-results.md"), "utf8");
    expect(log).toBe("ok");
    expect(summary).toContain("green");

    cleanupPaths.push(result.artifactsDir);
  });

  test("escalates to HumanGate on failing run", async () => {
    const dockerAdapter = new FakeAdapter(async (_task, options) => ({
      success: false,
      finalState: "HumanGate",
      checks: [{ name: "tests", status: "failed" }],
      artifactsDir: options.stateDir,
      logsPath: join(options.stateDir, "run.log"),
      errorCategory: "test-failure"
    }));

    const workflow = new OpenClawWorkflowTest({
      dockerAdapter,
      cliAdapter: new FakeAdapter(async (_task, options) => successResult(options))
    });

    const result = await workflow.run(join(process.cwd(), "src/testing/fixtures/tasks/example-task.json"));
    workflow.assertEscalation(result);
  });

  test("creates isolated state dir per run", async () => {
    const dockerAdapter = new FakeAdapter(async (_task, options) => successResult(options));

    const workflow = new OpenClawWorkflowTest({
      dockerAdapter,
      cliAdapter: new FakeAdapter(async (_task, options) => successResult(options))
    });

    await workflow.run(join(process.cwd(), "src/testing/fixtures/tasks/example-task.json"));
    await workflow.run(join(process.cwd(), "src/testing/fixtures/tasks/example-task.json"));

    expect(dockerAdapter.stateDirs.length).toBe(2);
    expect(dockerAdapter.stateDirs[0]).not.toBe(dockerAdapter.stateDirs[1]);
  });

  test("falls back to CLI adapter if Docker adapter throws", async () => {
    const dockerAdapter = new FakeAdapter(async () => {
      throw new Error("docker unavailable");
    });

    const cliAdapter = new FakeAdapter(async (_task, options) => successResult(options));

    const workflow = new OpenClawWorkflowTest({ dockerAdapter, cliAdapter });
    const result = await workflow.run(join(process.cwd(), "src/testing/fixtures/tasks/example-task.json"));

    expect(result.success).toBe(true);
    expect(result.finalState).toBe("ReadyForReview");
    expect(cliAdapter.runCalls).toBe(1);
  });
});
