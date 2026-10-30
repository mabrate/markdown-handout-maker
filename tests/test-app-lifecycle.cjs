'use strict';
// Optional native Electron smoke check; requires a working OS sandbox, as npm start does.
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-lifecycle-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let application, electronProcess;
  try {
    application = await _electron.launch({
      executablePath: require('electron'),
      args: [path.join(__dirname, '..'), `--user-data-dir=${profile}`],
      env, timeout: 15000
    });
    electronProcess = application.process();
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Exercise quit listeners inside a caught evaluation before actually quitting.
    // Undefined shutdown references fail this check without opening an error dialog.
    await application.evaluate(({ app }) => { app.emit('before-quit', { preventDefault() {} }); });
    const exited = new Promise(resolve => electronProcess.once('exit', (code, signal) => resolve({ code, signal })));
    await application.close();
    const result = await exited;
    assert.equal(result.code, 0, JSON.stringify(result));
    console.log('Native Electron startup and clean shutdown passed');
  } finally {
    if (application && electronProcess && electronProcess.exitCode === null) {
      await application.evaluate(({ app }) => app.exit(1)).catch(() => {});
    }
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
