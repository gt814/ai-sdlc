export type Priority = "low" | "medium" | "high" | "critical";

export type Profile = "mvp" | "prod";

export type CheckStatus = "passed" | "failed" | "skipped";

export type ErrorCategory = "config" | "runtime" | "test-failure" | "timeout";

export interface TestMatrixCommand {
  name: string;
  required: boolean;
  command: string;
}

export interface NormalizedTask {
  id: string;
  repo: string;
  branch: string;
  requirements: string;
  acceptance_criteria: string[];
  constraints: string[];
  priority: Priority;
  test_matrix_override?: TestMatrixCommand[];
}

export interface RunOptions {
  configPath: string;
  profile: Profile;
  workDir: string;
  stateDir: string;
  timeoutSec: number;
  sandboxMode?: string;
}

export interface RunCheck {
  name: string;
  status: CheckStatus;
}

export interface RunResult {
  success: boolean;
  finalState: string;
  checks: RunCheck[];
  artifactsDir: string;
  logsPath: string;
  errorCategory?: ErrorCategory;
}
