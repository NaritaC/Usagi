'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const geometry = require('../src/geometry.cjs');
const { SettingsStore, MIN_SCALE, DEFAULT_SCALE, MAX_SCALE, DEFAULT_SETTINGS, validatePatch } = require('../src/settings.cjs');

test('grounding respects negative monitor coordinates and taskbar work area', () => {
  const area = { x: -1920, y: -150, width: 1920, height: 1030 };
  assert.deepEqual(geometry.groundBounds(area, 1, -5000), { x: -1920, y: 686, width: 192, height: 208 });
  const right = geometry.groundBounds(area, 1, 9000);
  assert.equal(right.x + right.width, 0);
  assert.equal(right.y + geometry.GROUND_Y, area.y + area.height);
});

test('resizing preserves the character center when there is room and always remains grounded', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const previous = geometry.groundBounds(area, 1, 700);
  const resized = geometry.resizeGrounded(previous, area, 1.6);
  assert.ok(Math.abs(resized.x + resized.width / 2 - previous.x - previous.width / 2) <= 0.5);
  assert.ok(Math.abs(resized.y + geometry.GROUND_Y * 1.6 - 1040) <= 0.5);
  assert.equal(resized.width, 307);
  assert.equal(resized.height, 333);
});

test('dragging cannot lose the pet above, beside, or below the selected work area', () => {
  const area = { x: -1280, y: 40, width: 1280, height: 960 };
  const top = geometry.dragBounds({ x: -5000, y: -5000 }, { x: 80, y: 80 }, area, 1);
  assert.equal(top.x, area.x);
  assert.equal(top.y, area.y);
  const bottom = geometry.dragBounds({ x: 3000, y: 3000 }, { x: 80, y: 80 }, area, 1);
  assert.equal(bottom.x, -192);
  assert.equal(bottom.y, 806);
});

test('removed-monitor recovery selects overlap, then nearest screen, including negative coordinates', () => {
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, bounds: { x: -1280, y: 0, width: 1280, height: 1024 } },
  ];
  assert.equal(geometry.displayForBounds({ x: -800, y: 400, width: 192, height: 208 }, displays, 1).id, 2);
  assert.equal(geometry.displayForBounds({ x: -2600, y: 400, width: 192, height: 208 }, displays, 1).id, 2);
  assert.equal(geometry.displayForBounds({ x: 2400, y: 400, width: 192, height: 208 }, displays, 2).id, 1);
});

test('a work area narrower than the scaled pet still provides a valid finite origin', () => {
  assert.deepEqual(geometry.groundBounds({ x: -100, y: 0, width: 100, height: 500 }, 1.6, 20), {
    x: -100, y: 190, width: 307, height: 333,
  });
});

test('settings reject unknown names, non-booleans and invalid scale without coercion', () => {
  for (const patch of [{ scale: MIN_SCALE - 1 / 192 }, { scale: MAX_SCALE + 1 / 192 }, { scale: NaN }, { scale: '1' }, { roaming: 1 }, { launchAtLogin: true }, [], null]) {
    assert.throws(() => validatePatch(patch));
  }
  assert.deepEqual(validatePatch({ scale: MIN_SCALE, paused: false }), { scale: MIN_SCALE, paused: false });
  assert.deepEqual(validatePatch({ scale: MAX_SCALE }), { scale: MAX_SCALE });
  assert.equal(DEFAULT_SETTINGS.scale * 192, 112);
  assert.equal(geometry.petSize(DEFAULT_SCALE).width, 112);
});

test('settings and signed positions survive atomic save and reload; invalid patch leaves file intact', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'usagi-settings-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'settings.json');
  const store = new SettingsStore(file);
  assert.deepEqual(store.getSettings(), DEFAULT_SETTINGS);
  store.update({ scale: 128 / 192, lookAtCursor: false, roaming: false });
  store.setPosition({ x: -900, displayId: -42 });
  const saved = fs.readFileSync(file, 'utf8');
  assert.throws(() => store.update({ paused: 'false' }));
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  const restored = new SettingsStore(file);
  assert.equal(restored.getSettings().scale, 128 / 192);
  assert.equal(restored.getSettings().lookAtCursor, false);
  assert.deepEqual(restored.getPosition(), { x: -900, displayId: -42 });
  assert.deepEqual(fs.readdirSync(directory), ['settings.json']);
});

test('corrupt settings use defaults and preserve a recovery copy before replacement', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'usagi-corrupt-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'settings.json');
  fs.writeFileSync(file, 'broken original');
  let warning;
  const store = new SettingsStore(file, error => { warning = error; });
  assert.ok(warning);
  assert.deepEqual(store.getSettings(), DEFAULT_SETTINGS);
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken original');
  store.update({ paused: true });
  const backup = fs.readdirSync(directory).find(name => name.endsWith('.bak'));
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(directory, backup), 'utf8'), 'broken original');
  assert.equal(new SettingsStore(file).getSettings().paused, true);
});

test('legacy oversized scales migrate to Codex size without losing other settings or original file', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'usagi-size-migration-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const scale of [0.8, 1, 1.6]) {
    const file = path.join(directory, `settings-${scale}.json`);
    const original = JSON.stringify({
      version: 1,
      settings: { scale, roaming: false, lookAtCursor: false, alwaysOnTop: false, paused: true },
      position: { x: -700, displayId: 2 },
    });
    fs.writeFileSync(file, original);
    const store = new SettingsStore(file);
    assert.deepEqual(store.getSettings(), {
      scale: DEFAULT_SCALE, roaming: false, lookAtCursor: false, alwaysOnTop: false, paused: true,
    });
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.deepEqual(store.getPosition(), { x: -700, displayId: 2 });
    // Normal startup persists the same position, which must still save the pending migration.
    store.setPosition({ x: -700, displayId: 2 });
    const backup = fs.readdirSync(directory).find(name => name.startsWith(`settings-${scale}.json.`) && name.endsWith('.bak'));
    assert.ok(backup);
    assert.equal(fs.readFileSync(path.join(directory, backup), 'utf8'), original);
    assert.equal(new SettingsStore(file).getSettings().scale, DEFAULT_SCALE);
  }
});

test('saved scales already within the new interval retain their precise value', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'usagi-size-current-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const scale of [MIN_SCALE, DEFAULT_SCALE, 0.6, MAX_SCALE]) {
    const file = path.join(directory, `settings-${scale}.json`);
    fs.writeFileSync(file, JSON.stringify({ version: 1, settings: { ...DEFAULT_SETTINGS, scale }, position: null }));
    const store = new SettingsStore(file);
    assert.equal(store.getSettings().scale, scale);
    assert.equal(store.needsRecoveryCopy, false);
  }
});
