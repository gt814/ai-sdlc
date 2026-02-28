import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { NormalizedTask, Profile, RunResult } from "../../domain/types";
import { CliOpenClawAdapter } from "../../runtime/CliOpenClawAdapter";
import { DockerOpenClawAdapter } from "../../runtime/DockerOpenClawAdapter";
import type { OpenClawAdapter } from "../../runtime/OpenClawAdapter";

export interface OpenClawWorkflowTestOptions {
  configPath?: string;
  workDir?: string;
  timeoutSec?: number;
  keepState?: boolean;
  dockerAdapter?: OpenClawAdapter;
  cliAdapter?: OpenClawAdapter;
}

export class OpenClawWorkflowTest {
  private readonly configPath: string;
  private readonly workDir: string;
  private readonly timeoutSec: number;
  private readonly keepState: boolean;
  private readonly dockerAdapter: OpenClawAdapter;
  private readonly cliAdapter: OpenClawAdapter;
  private lastStateDir: string | null = null;

  constructor(options: OpenClawWorkflowTestOptions = {}) {
    this.configPath = resolve(options.configPath ?? join(process.cwd(), "openclaw.yaml"));
    this.workDir = resolve(options.workDir ?? process.cwd());
    this.timeoutSec = options.timeoutSec ?? 120;
    this.keepState = options.keepState ?? false;
    this.dockerAdapter = options.dockerAdapter ?? new DockerOpenClawAdapter();
    this.cliAdapter = options.cliAdapter ?? new CliOpenClawAdapter();
  }

  getLastStateDir(): string | null {
    return this.lastStateDir;
  }

  async run(taskFixturePath: string, profile: Profile = "mvp"): Promise<RunResult> {
    const fixtureAbsolutePath = resolve(taskFixturePath);
    const task = await this.loadTask(fixtureAbsolutePath);

    const validation = await this.dockerAdapter.validateConfig(this.configPath);
    if (!validation.valid) {
      throw new Error(`Invalid OpenClaw config: ${validation.errors.join("; ")}`);
    }

    const stateDir = await mkdtemp(join(tmpdir(), "openclaw-workflow-test-"));
    this.lastStateDir = stateDir;

    try {
      return await this.dockerAdapter.runTask(task, {
        configPath: this.configPath,
        profile,
        workDir: this.workDir,
        stateDir,
        timeoutSec: this.timeoutSec
      });
    } catch {
      return this.cliAdapter.runTask(task, {
        configPath: this.configPath,
        profile,
        workDir: this.workDir,
        stateDir,
        timeoutSec: this.timeoutSec,
        sandboxMode: "agents.defaults.sandbox"
      });
    } finally {
      if (!this.keepState) {
        await rm(stateDir, { recursive: true, force: true });
      }
    }
  }

  assertSuccess(result: RunResult): void {
    if (!result.success) {
      throw new Error(`Expected success, got final state '${result.finalState}'`);
    }

    if (result.finalState !== "ReadyForReview") {
      throw new Error(`Expected final state ReadyForReview, got '${result.finalState}'`);
    }

    const failedCheck = result.checks.find((check) => check.status === "failed");
    if (failedCheck) {
      throw new Error(`Expected no failed checks, got '${failedCheck.name}'`);
    }
  }

  assertEscalation(result: RunResult): void {
    if (result.finalState !== "HumanGate") {
      throw new Error(`Expected final state HumanGate, got '${result.finalState}'`);
    }

    if (result.success) {
      throw new Error("Expected unsuccessful result for escalation path.");
    }
  }

  private async loadTask(taskFixturePath: string): Promise<NormalizedTask> {
    const raw = await readFile(taskFixturePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<NormalizedTask>;

    const requiredStringFields: (keyof NormalizedTask)[] = [
      "id",
      "repo",
      "branch",
      "requirements",
      "priority"
    ];

    for (const key of requiredStringFields) {
      if (typeof parsed[key] !== "string" || (parsed[key] as string).length === 0) {
        throw new Error(`Invalid task fixture: field '${key}' must be a non-empty string.`);
      }
    }

    if (!Array.isArray(parsed.acceptance_criteria) || !Array.isArray(parsed.constraints)) {
      throw new Error("Invalid task fixture: acceptance_criteria and constraints must be arrays.");
    }

    return parsed as NormalizedTask;
  }
}
