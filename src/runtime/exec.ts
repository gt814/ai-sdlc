import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutSec?: number;
}

export type ExecFn = (command: string, args: string[], options?: ExecOptions) => Promise<ExecResult>;

export const execCommand: ExecFn = (command, args, options = {}) => {
  return new Promise<ExecResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timeoutHandle: NodeJS.Timeout | undefined;

    if (options.timeoutSec && options.timeoutSec > 0) {
      timeoutHandle = setTimeout(() => {
        child.kill("SIGKILL");
      }, options.timeoutSec * 1000);
    }

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString("utf8");
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString("utf8");
    });

    child.on("error", (error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });
  });
};
