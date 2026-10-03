import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { compose } from './compose.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let temporaryDirectory;
try {
  const rawPort = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const port = Number(rawPort);
  const environment = await compose(path.join(root, 'data'), port);
  if (process.argv.includes('--validate')) {
    console.log(`Valid: ${environment.folders.filter((folder) => environment.rootChildren.some((child) => child.uuid === folder.uuid)).length} projects, ${environment.routes.length} routes (including /health)`);
  } else {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'centralized-mock-'));
    const runtimeFile = path.join(temporaryDirectory, 'environment.json');
    await writeFile(runtimeFile, JSON.stringify(environment));
    const child = spawn(process.execPath, [path.join(root, 'node_modules/@mockoon/cli/bin/run'),
      'start', '--data', runtimeFile, '--port', String(port), '--hostname', '0.0.0.0', '--disable-admin-api'],
    { stdio: 'inherit', cwd: root });
    const terminate = () => child.kill('SIGTERM');
    const interrupt = () => child.kill('SIGINT');
    process.on('SIGTERM', terminate);
    process.on('SIGINT', interrupt);
    const { code, signal } = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    process.removeListener('SIGTERM', terminate);
    process.removeListener('SIGINT', interrupt);
    process.exitCode = code ?? (signal === 'SIGTERM' ? 143 : 130);
  }
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}
