const { exec } = require('child_process');

const port = process.env.PORT || 3000;
const cmd = `npx mockoon-cli start --data ./mockoon-environment.json --port ${port}`;

console.log('Menjalankan:', cmd);
const child = exec(cmd);

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
