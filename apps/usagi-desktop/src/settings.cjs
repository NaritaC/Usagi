'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIN_SCALE = 80 / 192;
const DEFAULT_SCALE = 112 / 192;
const MAX_SCALE = 144 / 192;

const DEFAULT_SETTINGS = Object.freeze({
  scale: DEFAULT_SCALE,
  roaming: true,
  lookAtCursor: true,
  alwaysOnTop: true,
  paused: false,
});
let writeSequence = 0;

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(patch))) {
    throw new TypeError('Settings must be an object');
  }
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new TypeError(`Unknown setting: ${key}`);
    if (key === 'scale') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_SCALE || value > MAX_SCALE) {
        throw new RangeError('Scale must produce a pet width between 80 and 144 CSS pixels');
      }
    } else if (typeof value !== 'boolean') {
      throw new TypeError(`${key} must be a boolean`);
    }
    clean[key] = value;
  }
  return clean;
}

function validPosition(position) {
  return position && typeof position === 'object'
    && Number.isFinite(position.x)
    && Number.isSafeInteger(position.displayId);
}

function atomicWrite(filePath, document) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${++writeSequence}.tmp`;
  let handle;
  try {
    handle = fs.openSync(temporary, 'wx');
    fs.writeFileSync(handle, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (handle !== undefined) fs.closeSync(handle);
    try { fs.unlinkSync(temporary); } catch { /* A failed write can already have removed it. */ }
    throw error;
  }
}

class SettingsStore {
  constructor(filePath, onLoadError = () => {}) {
    this.filePath = filePath;
    this.settings = { ...DEFAULT_SETTINGS };
    this.position = null;
    this.needsRecoveryCopy = false;
    try {
      const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!document || document.version !== 1 || !document.settings) throw new Error('Unsupported settings file');
      const loadedSettings = document.settings;
      const legacyScale = loadedSettings.scale;
      if (typeof legacyScale === 'number' && Number.isFinite(legacyScale)
        && legacyScale >= 0.6 && legacyScale <= 1.6
        && (legacyScale < MIN_SCALE || legacyScale > MAX_SCALE)) {
        loadedSettings.scale = DEFAULT_SCALE;
        this.needsRecoveryCopy = true;
      }
      this.settings = { ...DEFAULT_SETTINGS, ...validatePatch(loadedSettings) };
      this.position = validPosition(document.position)
        ? { x: Math.round(document.position.x), displayId: document.position.displayId } : null;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.needsRecoveryCopy = fs.existsSync(filePath);
        onLoadError(error);
      }
    }
  }

  getSettings() { return { ...this.settings }; }
  getPosition() { return this.position ? { ...this.position } : null; }

  persist(settings, position) {
    if (this.needsRecoveryCopy) {
      const backupPath = `${this.filePath}.invalid-${Date.now()}-${process.pid}.bak`;
      fs.copyFileSync(this.filePath, backupPath, fs.constants.COPYFILE_EXCL);
      this.needsRecoveryCopy = false;
    }
    atomicWrite(this.filePath, { version: 1, settings, position });
  }

  update(patch) {
    const next = { ...this.settings, ...validatePatch(patch) };
    if (!this.needsRecoveryCopy && Object.keys(DEFAULT_SETTINGS).every(key => next[key] === this.settings[key])) return this.getSettings();
    this.persist(next, this.position);
    this.settings = next;
    return this.getSettings();
  }

  setPosition(position) {
    if (!validPosition(position)) throw new TypeError('Invalid saved position');
    const next = { x: Math.round(position.x), displayId: position.displayId };
    if (!this.needsRecoveryCopy && this.position && next.x === this.position.x && next.displayId === this.position.displayId) return;
    this.persist(this.settings, next);
    this.position = next;
  }
}

module.exports = { MIN_SCALE, DEFAULT_SCALE, MAX_SCALE, DEFAULT_SETTINGS, validatePatch, atomicWrite, SettingsStore };
