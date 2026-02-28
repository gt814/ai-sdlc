import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { parse } from "yaml";

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_TOP_LEVEL_KEYS = [
  "version",
  "name",
  "profiles",
  "pipeline",
  "project",
  "definition_of_done",
  "safety"
] as const;

export async function validateOpenClawConfig(configPath: string): Promise<ValidationResult> {
  const errors: string[] = [];

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    return {
      valid: false,
      errors: [`Cannot read config file: ${String(error)}`]
    };
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid YAML: ${String(error)}`]
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: ["Config root must be an object."]
    };
  }

  const root = parsed as Record<string, unknown>;

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in root)) {
      errors.push(`Missing top-level key: ${key}`);
    }
  }

  const pipeline = root.pipeline;
  if (typeof pipeline !== "object" || pipeline === null) {
    errors.push("pipeline must be an object.");
  } else {
    const states = (pipeline as Record<string, unknown>).states;
    if (!Array.isArray(states) || states.length === 0) {
      errors.push("pipeline.states must be a non-empty array.");
    }
  }

  const profiles = root.profiles;
  if (typeof profiles !== "object" || profiles === null) {
    errors.push("profiles must be an object.");
  } else {
    const profileRoot = profiles as Record<string, unknown>;
    if (typeof profileRoot.active !== "string") {
      errors.push("profiles.active must be a string.");
    }
    if (typeof profileRoot.available !== "object" || profileRoot.available === null) {
      errors.push("profiles.available must be an object.");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? "openclaw.yaml";
  const result = await validateOpenClawConfig(configPath);

  if (!result.valid) {
    for (const error of result.errors) {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("openclaw.yaml validation passed\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
