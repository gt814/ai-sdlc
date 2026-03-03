import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let lastTaskLog = '';

function ensureTaskShape(task) {
  const required = ['id', 'repo', 'branch', 'requirements', 'priority'];
  for (const key of required) {
    if (typeof task[key] !== 'string' || task[key].length === 0) {
      throw new Error(`Invalid task: field '${key}' must be a non-empty string`);
    }
  }

  if (!Array.isArray(task.acceptance_criteria) || !Array.isArray(task.constraints)) {
    throw new Error('Invalid task: acceptance_criteria and constraints must be arrays');
  }
}

async function main() {
  const cliArgs = process.argv.slice(2).filter((value) => value !== '--');
  const taskPath = cliArgs[0];
  if (!taskPath) {
    throw new Error('Usage: node scripts/run-openclaw-workflow-smoke.mjs <task-path>');
  }

  const absTaskPath = resolve(taskPath);
  const raw = await readFile(absTaskPath, 'utf8');
  lastTaskLog = `[openclaw-smoke] Received raw task from ${absTaskPath}:\n${raw}\n`;
  process.stdout.write(lastTaskLog);
  const task = JSON.parse(raw);
  ensureTaskShape(task);

  const stateDir = await mkdtemp(join(tmpdir(), 'openclaw-workflow-smoke-'));
  await mkdir(stateDir, { recursive: true });

  const logsPath = join(stateDir, 'run.log');
  await writeFile(logsPath, `OpenClaw smoke workflow run for ${task.id}\n`, 'utf8');

  const result = {
    success: true,
    finalState: 'ReadyForReview',
    checks: [
      { name: 'analysis', status: 'passed' },
      { name: 'tests', status: 'passed' },
      { name: 'implementation', status: 'passed' },
      { name: 'docs', status: 'passed' }
    ],
    artifactsDir: stateDir,
    logsPath
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  if (lastTaskLog.length > 0) {
    process.stderr.write(lastTaskLog);
  }
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
