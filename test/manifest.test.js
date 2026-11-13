import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { repoRoot } from '../scripts/extension-support.js';

test('manifest matches the extension the scripts actually load', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.permissions.includes('scripting'), false);
  assert.ok(manifest.permissions.includes('storage'));
  assert.equal(manifest.commands['toggle-panel'].suggested_key.default, 'Ctrl+Shift+K');
  assert.equal(manifest.commands['toggle-panel'].suggested_key.mac, 'Command+Shift+K');
  assert.ok(manifest.optional_host_permissions.includes('https://*/*'));
  assert.deepEqual(manifest.content_scripts[0].js, [
    'utils/config.js',
    'utils/markdown.js',
    'utils/messages.js',
    'utils/keys.js',
    'utils/page-parser.js',
    'content.js'
  ]);
  const background = fs.readFileSync(path.join(repoRoot, 'background.js'), 'utf8');
  assert.match(background, /utils\/chat-controller\.js/);
  assert.match(background, /utils\/api\.js/);
});

test('every extension script parses', () => {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(repoRoot);
  assert.ok(files.length > 10);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}\n${result.stderr}`);
  }
});
