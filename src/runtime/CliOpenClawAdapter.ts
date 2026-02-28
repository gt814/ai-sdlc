import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateOpenClawConfig } from "../config/validateOpenClawConfig";
import type { NormalizedTask, RunOptions, RunResult } from "../domain/types";
import type { ConfigValidationResult, OpenClawAdapter } from "./OpenClawAdapter";
import { execCommand, type ExecFn, type ExecResult } from "./exec";

function parseRunResult(raw: string): RunResult | null {
  try {
    const parsed = JSON.parse(raw) as RunResult;
    if (typeof parsed.success !== "boolean" || typeof parsed.finalState !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export class CliOpenClawAdapter implements OpenClawAdapter {
  constructor(
    private readonly execFn: ExecFn = execCommand,
    private readonly binary: string = process.env.OPENCLOW_CLI_BIN ?? "openclaw"
  ) {}

  async runTask(task: NormalizedTask, options: RunOptions): Promise<RunResult> {
    await mkdir(options.stateDir, { recursive: true });

    const taskPath = join(options.stateDir, "task.json");
    const resultPath = join(options.stateDir, "run-result.json");
    const logsPath = join(options.stateDir, "run.log");

    await writeFile(taskPath, JSON.stringify(task, null, 2), "utf8");

    const args = [
      "run",
      "--config",
      options.configPath,
      "--task",
      taskPath,
      "--profile",
      options.profile,
      "--state-dir",
      options.stateDir
    ];

    let execResult: ExecResult;
    try {
      execResult = await this.execFn(this.binary, args, {
        cwd: options.workDir,
        timeoutSec: options.timeoutSec,
        env: {
          ...process.env,
          OPENCLOW_SANDBOX: options.sandboxMode ?? "agents.defaults.sandbox"
        }
      });
    } catch (error) {
      throw new Error(`CLI OpenClaw run failed: ${String(error)}`);
    }

    await writeFile(logsPath, `${execResult.stdout}\n${execResult.stderr}`.trim(), "utf8");

    let parsedResult: RunResult | null = null;
    try {
      const rawResult = await readFile(resultPath, "utf8");
      parsedResult = parseRunResult(rawResult);
    } catch {
      parsedResult = null;
    }

    if (parsedResult) {
      return {
        ...parsedResult,
        logsPath,
        artifactsDir: options.stateDir
      };
    }

    const success = execResult.exitCode === 0;
    return {
      success,
      finalState: success ? "ReadyForReview" : "HumanGate",
      checks: [{ name: "runtime", status: success ? "passed" : "failed" }],
      artifactsDir: options.stateDir,
      logsPath,
      errorCategory: success ? undefined : "runtime"
    };
  }

  validateConfig(configPath: string): Promise<ConfigValidationResult> {
    return validateOpenClawConfig(configPath);
  }

  async cleanup(stateDir: string): Promise<void> {
    await rm(stateDir, { recursive: true, force: true });
  }
}
