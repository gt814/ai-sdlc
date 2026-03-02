import { readFile, writeFile } from 'node:fs/promises';

async function main() {
  const outPath = process.argv[2];
  if (!outPath) {
    throw new Error('Usage: node scripts/build-normalized-task-from-event.mjs <output-path>');
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is not set');
  }

  const raw = await readFile(eventPath, 'utf8');
  const event = JSON.parse(raw);

  const issue = event.issue || {};
  const issueNumber = issue.number || 0;
  const issueTitle = issue.title || 'OpenClaw task';
  const issueBody = issue.body || '';
  const repo = process.env.GITHUB_REPOSITORY || 'ai-sdlc';

  const task = {
    id: `ISSUE-${issueNumber || 'MANUAL'}`,
    repo,
    branch: 'main',
    requirements: `${issueTitle}\n\n${issueBody}`.trim(),
    acceptance_criteria: [
      'Требования задачи интерпретированы и зафиксированы',
      'Smoke workflow успешно завершён',
      'Артефакты прогона сохранены'
    ],
    constraints: [
      'Не менять несвязанные файлы',
      'Соблюдать CI policy репозитория'
    ],
    priority: 'medium'
  };

  await writeFile(outPath, JSON.stringify(task, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
