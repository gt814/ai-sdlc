import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parse } from 'yaml';

const REQUIRED_TOP_LEVEL_KEYS = [
  'version',
  'name',
  'profiles',
  'pipeline',
  'project',
  'definition_of_done',
  'safety'
];

async function validateOpenClawConfig(configPath) {
  const errors = [];

  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    return { valid: false, errors: [`Cannot read config file: ${String(error)}`] };
  }

  let parsed;
  try {
    parsed = parse(raw);
  } catch (error) {
    return { valid: false, errors: [`Invalid YAML: ${String(error)}`] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, errors: ['Config root must be an object.'] };
  }

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in parsed)) {
      errors.push(`Missing top-level key: ${key}`);
    }
  }

  const pipeline = parsed.pipeline;
  if (typeof pipeline !== 'object' || pipeline === null) {
    errors.push('pipeline must be an object.');
  } else {
    const states = pipeline.states;
    if (!Array.isArray(states) || states.length === 0) {
      errors.push('pipeline.states must be a non-empty array.');
    }
  }

  const profiles = parsed.profiles;
  if (typeof profiles !== 'object' || profiles === null) {
    errors.push('profiles must be an object.');
  } else {
    if (typeof profiles.active !== 'string') {
      errors.push('profiles.active must be a string.');
    }
    if (typeof profiles.available !== 'object' || profiles.available === null) {
      errors.push('profiles.available must be an object.');
    }
  }

  return { valid: errors.length === 0, errors };
}

const configPath = process.argv[2] ?? 'openclaw.yaml';
const result = await validateOpenClawConfig(configPath);

if (!result.valid) {
  for (const error of result.errors) {
    process.stderr.write(`${error}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('openclaw.yaml validation passed\n');
}
