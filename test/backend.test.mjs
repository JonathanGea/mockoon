import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, symlink, rm, readdir } from 'node:fs/promises';
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
  for (const endpoint of ['/ecommerce/api/public/content', '/ecommerce/api/admin/products', '/church/public/home', '/motorcycle/motors']) {
    const response = await fetch(base + endpoint);
    assert.equal(response.status, 200, endpoint);
    assert.ok(await response.json());
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  }
  const fixture = await fetch(`${base}/project3/users`);
  assert.deepEqual(await fixture.json(), [{ id: 3 }]);
  assert.equal(fixture.headers.get('x-project'), 'project3');
  const origin = 'http://localhost:5173';
  for (const endpoint of ['/ecommerce/api/admin/products', '/church/public/home', '/project3/users']) {
    const preflight = await fetch(base + endpoint, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,x-mock-status,x-media-owner,x-file-name' }
    });
    assert.equal(preflight.status, 200);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    assert.ok(preflight.headers.get('access-control-allow-methods').split(',').includes('PUT'));
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'content-type,x-mock-status,x-media-owner,x-file-name');
    const response = await fetch(base + endpoint, { headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.match(response.headers.get('vary'), /Origin/);
  }
  const ecommerce = JSON.parse(await readFile(path.join(directory, 'data/ecommerce/environment.json'), 'utf8'));
  for (const route of ecommerce.routes.filter((route) => route.method === 'get')) {
    const response = await fetch(`${base}/ecommerce/${route.endpoint}`);
    assert.equal(response.status, 200, route.endpoint);
    if (response.headers.get('content-type').startsWith('application/json')) await response.json();
    else assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  for (const status of [401, 403, 422, 500]) {
    const response = await fetch(`${base}/ecommerce/api/public/content`, { headers: { Origin: origin, 'X-Mock-Status': String(status) } });
    assert.equal(response.status, status);
    assert.ok((await response.json()).error);
  }
  const jsonRequest = (endpoint, method, body) => fetch(base + endpoint, {
    method, headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body)
  });
  const login = await jsonRequest('/ecommerce/api/session', 'POST', { email: 'viewer@example.test' });
  assert.equal(login.status, 200);
  assert.equal((await (await fetch(`${base}/ecommerce/api/session`)).json()).user.email, 'viewer@example.test');
  const logout = await fetch(`${base}/ecommerce/api/session`, { method: 'DELETE' });
  assert.equal(logout.status, 200);
  assert.equal((await (await fetch(`${base}/ecommerce/api/session`)).json()).authorized, false);
  const products = await (await fetch(`${base}/ecommerce/api/admin/products`)).json();
  const product = { ...products[0], name: 'Integration test product' };
  assert.equal((await jsonRequest('/ecommerce/api/admin/products', 'PUT', product)).status, 200);
  const updatedProducts = await (await fetch(`${base}/ecommerce/api/admin/products`)).json();
  assert.equal(updatedProducts.find((item) => item.id === product.id).name, product.name);
  assert.equal((await jsonRequest('/ecommerce/api/public/orders', 'POST', {})).status, 422);
  const inventory = await (await fetch(`${base}/ecommerce/api/admin/inventory`)).json();
  const line = inventory.find((item) => item.onHand - item.reserved > 2);
  assert.ok(line, 'fixture needs an available variant');
  const orderBody = { customerName: 'Integration test', channel: 'ONLINE',
    items: [{ variantId: line.variantId, quantity: 1 }], idempotencyKey: 'integration-test' };
  const created = await jsonRequest('/ecommerce/api/public/orders', 'POST', orderBody);
  assert.equal(created.status, 200);
  const order = await created.json();
  assert.ok(order.id);
  const repeated = await jsonRequest('/ecommerce/api/public/orders', 'POST', orderBody);
  assert.equal((await repeated.json()).id, order.id);
  const orders = await (await fetch(`${base}/ecommerce/api/admin/orders`)).json();
  assert.equal(orders.filter((item) => item.id === order.id).length, 1);
  const upload = await jsonRequest('/ecommerce/api/admin/media', 'POST', {});
  assert.equal(upload.status, 200);
  const media = await upload.json();
  for (const url of [media.url, ...Object.values(media.renditions)]) {
    assert.equal(url, '/ecommerce/managed-media/demo.png');
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
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
