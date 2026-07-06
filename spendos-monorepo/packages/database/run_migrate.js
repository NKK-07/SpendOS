const { spawn } = require('child_process');

const child = spawn('npx', ['prisma', 'migrate', 'dev', '--name', 'beta-schema-v1'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true
});

setTimeout(() => {
  child.stdin.write('y\n');
  child.stdin.end();
}, 2000); // give it a moment to prompt

child.on('exit', (code) => {
  process.exit(code);
});
