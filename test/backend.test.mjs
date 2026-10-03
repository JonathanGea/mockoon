import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import commons from '@mockoon/commons';
import { compose } from '../scripts/compose.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function workspace(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mock-backend-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(path.join(root, 'scripts'), path.join(directory, 'scripts'), { recursive: true });
  await cp(path.join(root, 'data'), path.join(directory, 'data'), { recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  return directory;
}

async function addProject(directory) {
  const environment = commons.BuildEnvironment({ hasDefaultRoute: true });
  environment.endpointPrefix = 'project3';
  environment.routes[0].endpoint = 'users';
  environment.routes[0].responses[0].bodyType = 'FILE';
  environment.routes[0].responses[0].filePath = '../shared/users.json';
  environment.headers = [{ key: 'X-Project', value: 'project3' }];
  await mkdir(path.join(directory, 'data/project3'), { recursive: true });
  await mkdir(path.join(directory, 'data/shared'), { recursive: true });
  await writeFile(path.join(directory, 'data/shared/users.json'), '[{"id":3}]');
  await writeFile(path.join(directory, 'data/project3/environment.json'), JSON.stringify(environment));
  return environment;
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('serves all projects and a discovered project with shared fixture on PORT; shuts down cleanly', { timeout: 20000 }, async (t) => {
  const directory = await workspace(t);
  await addProject(directory);
  const port = await freePort();
  const temporaryRoot = path.join(directory, 'runtime');
  await mkdir(temporaryRoot);
  const child = spawn(process.execPath, [path.join(directory, 'scripts/start.mjs')], {
    env: { ...process.env, PORT: String(port), TMPDIR: temporaryRoot }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${base}/health`)).ok; } catch {}
    if (ready || child.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, logs);
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok' });
  for (const endpoint of ['/ecommerce/products', '/ecommerce/products/101', '/church/public/home', '/motorcycle/motors']) {
    const response = await fetch(base + endpoint);
    assert.equal(response.status, 200, endpoint);
    assert.ok(await response.json());
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  }
  const fixture = await fetch(`${base}/project3/users`);
  assert.deepEqual(await fixture.json(), [{ id: 3 }]);
  assert.equal(fixture.headers.get('x-project'), 'project3');
  const created = await fetch(`${base}/ecommerce/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), '/ecommerce/orders/5001');
  const motor = await fetch(`${base}/motorcycle/motors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"brand":"Honda"}' });
  assert.equal(motor.status, 201);
  assert.deepEqual(await motor.json(), { brand: 'Honda' });
  assert.equal((await fetch(`${base}/api/products`)).status, 404);
  assert.equal((await fetch(`${base}/products`)).status, 404);
  assert.equal((await fetch(`${base}/mockoon-admin/logs`)).status, 404);
  const stopped = once(child, 'exit');
  child.kill('SIGTERM');
  assert.deepEqual(await stopped, [143, null]);
  assert.deepEqual(await readdir(temporaryRoot), []);
  await assert.rejects(fetch(`${base}/health`));
});

test('rejects duplicate routes, identifiers, broken references, and inconsistent namespaces', async (t) => {
  const directory = await workspace(t);
  const environment = await addProject(directory);
  const target = path.join(directory, 'data/project3/environment.json');
  const original = structuredClone(environment);
  const check = async (mutate, pattern) => {
    const changed = structuredClone(original);
    mutate(changed);
    await writeFile(target, JSON.stringify(changed));
    await assert.rejects(compose(path.join(directory, 'data'), 3000), pattern);
  };
  await check((env) => { env.endpointPrefix = 'other'; }, /endpointPrefix/);
  await check((env) => { env.rootChildren = []; }, /rootChildren/);
  await check((env) => {
    const duplicate = commons.BuildHTTPRoute();
    duplicate.endpoint = 'users';
    env.routes.push(duplicate);
    env.rootChildren.push({ type: 'route', uuid: duplicate.uuid });
  }, /duplicate route/);
  await check((env) => { env.routes[0].responses[0].uuid = env.routes[0].uuid; }, /duplicate identifier/);
});

test('invalid PORT fails before starting a server', async () => {
  const child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: root, env: { ...process.env, PORT: 'invalid' } });
  let output = '';
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(output, /PORT must be/);
});

test('generator produces an automatically discovered project and refuses to overwrite it', async (t) => {
  const directory = await workspace(t);
  const generate = async () => {
    const child = spawn(process.execPath, [path.join(directory, 'scripts/new-project.mjs'), 'inventory']);
    child.stdout.resume();
    child.stderr.resume();
    return (await once(child, 'exit'))[0];
  };
  assert.equal(await generate(), 0);
  const combined = await compose(path.join(directory, 'data'), 3000);
  assert.ok(combined.routes.some((route) => route.endpoint === 'inventory/example'));
  assert.equal(await generate(), 1);
});
