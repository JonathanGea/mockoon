import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import commons from '@mockoon/commons';

const slug = process.argv[2];
try {
  if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug) || ['shared', 'health', 'mockoon-admin'].includes(slug)) {
    throw new Error('Usage: npm run new-project -- <slug> (lowercase letters, digits, hyphens; start with a letter)');
  }
  const directory = fileURLToPath(new URL(`../data/${slug}/`, import.meta.url));
  const environment = commons.BuildEnvironment({ hasDefaultRoute: true });
  environment.name = slug;
  environment.endpointPrefix = slug;
  environment.hostname = '0.0.0.0';
  environment.headers = structuredClone(commons.CORSHeaders);
  environment.routes[0].endpoint = 'example';
  environment.routes[0].responses[0].body = '{"message":"Hello from ' + slug + '"}';
  environment.routes[0].responses[0].headers = [{ key: 'Content-Type', value: 'application/json' }];
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'environment.json'), JSON.stringify(environment, null, 2) + '\n', { flag: 'wx' });
  console.log(`Created data/${slug}/environment.json. Restart the server to serve /${slug}/example.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
