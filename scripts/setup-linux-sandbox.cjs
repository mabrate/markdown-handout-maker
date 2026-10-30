'use strict';

// Ubuntu 24.04+ requires an AppArmor allowance for Electron's user namespaces.
// Keep this scoped to this checkout; never disable Chromium's sandbox globally.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal || result.status}).`);
}

try {
  if (process.platform !== 'linux') throw new Error('This setup is only for Linux with AppArmor.');
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--print')) {
    throw new Error('Usage: npm run setup:linux-sandbox [-- --print]');
  }
  const executable = fs.realpathSync(require('electron'));
  // AppArmor interprets glob characters even inside quoted attachment paths.
  if (/[\x00-\x1f\x7f"\\*?\[\]{}]/.test(executable)) {
    throw new Error('Move this checkout to a path without quotes, backslashes, or glob characters.');
  }
  const name = `handout-maker-${createHash('sha256').update(executable).digest('hex').slice(0, 12)}`;
  const destination = `/etc/apparmor.d/${name}`;
  const profile = `# Allow user namespaces only for this Handout Maker development executable.
# Re-run setup after moving the checkout; npm updates at this path need no change.
abi <abi/4.0>,
include <tunables/global>

profile ${name} "${executable}" flags=(unconfined) {
  userns,
}
`;
  if (args[0] === '--print') {
    process.stdout.write(profile);
  } else {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'handout-apparmor-'));
    try {
      const source = path.join(temporary, name);
      fs.writeFileSync(source, profile, { mode: 0o600 });
      // Check syntax without loading a policy or touching AppArmor's cache.
      run('/usr/sbin/apparmor_parser', ['--skip-kernel-load', '--skip-cache', source]);
      console.log(`Installing ${destination}:\n\n${profile}`);
      run('sudo', ['install', '-o', 'root', '-g', 'root', '-m', '644', source, destination]);
      run('sudo', ['/usr/sbin/apparmor_parser', '--replace', destination]);
      console.log('AppArmor profile loaded. Start the app with npm start.');
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
