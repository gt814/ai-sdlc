import type { NormalizedTask, RunOptions, RunResult } from "../domain/types";

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export interface OpenClawAdapter {
  runTask(task: NormalizedTask, options: RunOptions): Promise<RunResult>;
  validateConfig(configPath: string): Promise<ConfigValidationResult>;
  cleanup(stateDir: string): Promise<void>;
}
