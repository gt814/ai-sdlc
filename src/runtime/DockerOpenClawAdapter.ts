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

export class DockerOpenClawAdapter implements OpenClawAdapter {
  constructor(
    private readonly execFn: ExecFn = execCommand,
    private readonly imageTag: string = process.env.OPENCLOW_IMAGE_TAG ?? "openclaw:0.1.0"
  ) {}

  async runTask(task: NormalizedTask, options: RunOptions): Promise<RunResult> {
    await mkdir(options.stateDir, { recursive: true });

    const taskPath = join(options.stateDir, "task.json");
    const resultPath = join(options.stateDir, "run-result.json");
    const logsPath = join(options.stateDir, "run.log");

    await writeFile(taskPath, JSON.stringify(task, null, 2), "utf8");

    const dockerCommand =
      process.env.OPENCLOW_DOCKER_CMD ??
      "openclaw run --config /work/openclaw.yaml --task /work/task.json --profile $OPENCLOW_PROFILE --state-dir /work/state";

    const args = [
      "run",
      "--rm",
      "-v",
      `${options.configPath}:/work/openclaw.yaml:ro`,
      "-v",
      `${taskPath}:/work/task.json:ro`,
      "-v",
      `${options.stateDir}:/work/state`,
      "-e",
      `OPENCLOW_PROFILE=${options.profile}`,
      this.imageTag,
      "sh",
      "-lc",
      dockerCommand
    ];

    let execResult: ExecResult;
    try {
      execResult = await this.execFn("docker", args, {
        cwd: options.workDir,
        timeoutSec: options.timeoutSec
      });
    } catch (error) {
      throw new Error(`Docker OpenClaw run failed: ${String(error)}`);
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
      checks: [
        { name: "runtime", status: success ? "passed" : "failed" }
      ],
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
