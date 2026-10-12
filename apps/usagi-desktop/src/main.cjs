'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, screen, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const geometry = require('./geometry.cjs');
const { SettingsStore } = require('./settings.cjs');

const PET_FILE = path.join(__dirname, 'pet.html');
const SETTINGS_FILE = path.join(__dirname, 'settings.html');
const PRELOAD_FILE = path.join(__dirname, 'preload.cjs');
const ACTIONS = Object.freeze({
  idle: '安静站立',
  'running-right': '向右小跑',
  'running-left': '向左小跑',
  waving: '挥手',
  jumping: '跳一跳',
  failed: '垂耳',
  waiting: '期待',
  running: '思考',
  review: '认真看看',
});

if (process.env.USAGI_USER_DATA) {
  const testDataPath = path.resolve(process.env.USAGI_USER_DATA);
  fs.mkdirSync(testDataPath, { recursive: true });
  app.setPath('userData', testDataPath);
}

let petWindow;
let settingsWindow;
let tray;
let store;
let activeDisplayId;
let dragOffset = null;
let dragLastCursor;
let dragLastMovementAt = 0;
let petHit = false;
let ticker;
let positionTimer;
let quitting = false;
let motionX;

function settings() { return store.getSettings(); }
function isPetAlive() { return petWindow && !petWindow.isDestroyed(); }

function displayForPet() {
  const displays = screen.getAllDisplays();
  return displays.find(display => display.id === activeDisplayId)
    || geometry.displayForBounds(petWindow.getBounds(), displays, screen.getPrimaryDisplay().id);
}

function applyBounds(bounds) {
  if (!isPetAlive()) return;
  const previous = petWindow.getBounds();
  if (['x', 'y', 'width', 'height'].some(key => previous[key] !== bounds[key])) petWindow.setBounds(bounds, false);
}

function savePosition() {
  if (!isPetAlive()) return;
  try { store.setPosition({ x: petWindow.getBounds().x, displayId: displayForPet().id }); }
  catch (error) { console.error('Unable to save Usagi position:', error.message); }
}

function queuePositionSave() {
  if (positionTimer) return;
  positionTimer = setTimeout(() => {
    positionTimer = undefined;
    savePosition();
  }, 1000);
}

function snapshot() {
  const display = displayForPet();
  return {
    settings: settings(),
    bounds: petWindow.getBounds(),
    workArea: { ...display.workArea },
    cursor: screen.getCursorScreenPoint(),
    dragging: !!dragOffset,
    interactive: !!dragOffset || petHit,
  };
}

function sendSnapshot() {
  if (!isPetAlive()) return;
  const state = snapshot();
  for (const window of [petWindow, settingsWindow]) {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('usagi:tick', state);
  }
}

function updateMouseCapture() {
  if (isPetAlive()) petWindow.setIgnoreMouseEvents(!dragOffset && !petHit, { forward: true });
}

function endDrag() {
  if (!dragOffset || !isPetAlive()) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  activeDisplayId = display.id;
  dragOffset = null;
  applyBounds(geometry.groundBounds(display.workArea, settings().scale, petWindow.getBounds().x));
  motionX = petWindow.getBounds().x;
  updateMouseCapture();
  savePosition();
  sendSnapshot();
}

function resetPosition() {
  if (!isPetAlive()) return;
  dragOffset = null;
  const display = screen.getPrimaryDisplay();
  activeDisplayId = display.id;
  applyBounds(geometry.initialBounds(display.workArea, settings().scale));
  motionX = petWindow.getBounds().x;
  updateMouseCapture();
  savePosition();
  sendSnapshot();
}

function playAction(id) {
  if (typeof id !== 'string' || !Object.hasOwn(ACTIONS, id) || !isPetAlive()) return;
  petWindow.webContents.send('usagi:action', id);
}

function updateSettings(patch) {
  const previous = settings();
  const next = store.update(patch);
  if (next.scale !== previous.scale) {
    if (dragOffset) endDrag();
    const display = displayForPet();
    applyBounds(geometry.resizeGrounded(petWindow.getBounds(), display.workArea, next.scale));
    motionX = petWindow.getBounds().x;
    savePosition();
  }
  if (next.alwaysOnTop !== previous.alwaysOnTop) petWindow.setAlwaysOnTop(next.alwaysOnTop, 'floating');
  refreshTray();
  sendSnapshot();
  return next;
}

function lockWindow(window, filePath) {
  const allowedUrl = pathToFileURL(filePath).href;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.__usagiUrl = allowedUrl;
}

function validSender(event, petOnly = false) {
  const windows = petOnly ? [petWindow] : [petWindow, settingsWindow];
  return windows.some(window => window && !window.isDestroyed()
    && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame
    && event.senderFrame.url === window.__usagiUrl);
}

function guardedOn(channel, petOnly, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (validSender(event, petOnly)) handler(...args);
  });
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  endDrag();
  settingsWindow = new BrowserWindow({
    width: 520, height: 780, minWidth: 470, minHeight: 620,
    title: '乌萨奇 · 设置', show: false, autoHideMenuBar: true,
    backgroundColor: '#fffaf0',
    webPreferences: { preload: PRELOAD_FILE, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  lockWindow(settingsWindow, SETTINGS_FILE);
  settingsWindow.removeMenu();
  settingsWindow.once('ready-to-show', () => settingsWindow?.show());
  settingsWindow.on('closed', () => { settingsWindow = undefined; });
  settingsWindow.loadFile(SETTINGS_FILE).catch(error => console.error('Unable to open settings:', error.message));
}

function refreshTray() {
  if (!tray) return;
  const current = settings();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '乌萨奇桌宠', enabled: false },
    { label: current.paused ? '继续陪伴' : '暂停活动', click: () => updateSettings({ paused: !settings().paused }) },
    { label: '表演动作', submenu: Object.entries(ACTIONS).map(([id, label]) => ({ label, click: () => playAction(id) })) },
    { type: 'separator' },
    { label: '设置…', click: openSettings },
    { label: '回到主屏', click: resetPosition },
    { type: 'separator' },
    { label: '退出乌萨奇', click: () => app.quit() },
  ]));
}

function registerIpc() {
  ipcMain.handle('usagi:get-state', event => {
    if (!validSender(event)) throw new Error('Invalid Usagi sender');
    return snapshot();
  });
  ipcMain.handle('usagi:update-settings', (event, patch) => {
    if (!validSender(event)) throw new Error('Invalid Usagi sender');
    return updateSettings(patch);
  });
  guardedOn('usagi:set-hit', true, hit => {
    if (typeof hit !== 'boolean' || hit === petHit) return;
    petHit = hit;
    updateMouseCapture();
  });
  guardedOn('usagi:begin-drag', true, () => {
    if (dragOffset || !petHit) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    dragLastCursor = cursor;
    dragLastMovementAt = Date.now();
    updateMouseCapture();
    sendSnapshot();
  });
  guardedOn('usagi:end-drag', true, endDrag);
  guardedOn('usagi:move-by', true, dx => {
    if (dragOffset || settings().paused || !settings().roaming || typeof dx !== 'number' || !Number.isFinite(dx) || Math.abs(dx) > 64) return;
    const bounds = petWindow.getBounds();
    const display = displayForPet();
    motionX = (Number.isFinite(motionX) ? motionX : bounds.x) + dx;
    const next = geometry.groundBounds(display.workArea, settings().scale, motionX);
    if (next.x === display.workArea.x || next.x === display.workArea.x + display.workArea.width - next.width) motionX = next.x;
    applyBounds(next);
    queuePositionSave();
  });
  guardedOn('usagi:open-settings', false, openSettings);
  guardedOn('usagi:play-action', false, playAction);
  guardedOn('usagi:reset-position', false, resetPosition);
  guardedOn('usagi:quit', false, () => app.quit());
}

function displaysChanged() {
  if (!isPetAlive()) return;
  dragOffset = null;
  const display = geometry.displayForBounds(petWindow.getBounds(), screen.getAllDisplays(), activeDisplayId);
  activeDisplayId = display.id;
  applyBounds(geometry.groundBounds(display.workArea, settings().scale, petWindow.getBounds().x));
  motionX = petWindow.getBounds().x;
  updateMouseCapture();
  savePosition();
  sendSnapshot();
}

async function createPet() {
  store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), error => {
    console.warn('Usagi settings could not be read; using defaults:', error.message);
  });
  const savedPosition = store.getPosition();
  const display = screen.getAllDisplays().find(item => item.id === savedPosition?.displayId) || screen.getPrimaryDisplay();
  activeDisplayId = display.id;
  const bounds = savedPosition
    ? geometry.groundBounds(display.workArea, settings().scale, savedPosition.x)
    : geometry.initialBounds(display.workArea, settings().scale);
  motionX = bounds.x;
  petWindow = new BrowserWindow({
    ...bounds, title: '乌萨奇桌宠', transparent: true, frame: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, focusable: false, skipTaskbar: true, show: false,
    hasShadow: false, alwaysOnTop: settings().alwaysOnTop,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD_FILE, contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, devTools: !app.isPackaged,
    },
  });
  lockWindow(petWindow, PET_FILE);
  petWindow.removeMenu();
  petWindow.setAlwaysOnTop(settings().alwaysOnTop, 'floating');
  updateMouseCapture();
  petWindow.once('ready-to-show', () => { if (isPetAlive()) petWindow.showInactive(); });
  petWindow.on('closed', () => {
    petWindow = undefined;
    if (!quitting) app.quit();
  });
  registerIpc();
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 20, height: 20 }));
  tray.setToolTip('乌萨奇桌宠');
  tray.on('double-click', openSettings);
  refreshTray();
  ticker = setInterval(() => {
    if (!isPetAlive()) return;
    if (dragOffset) {
      const cursor = screen.getCursorScreenPoint();
      if (cursor.x !== dragLastCursor.x || cursor.y !== dragLastCursor.y) {
        dragLastCursor = cursor;
        dragLastMovementAt = Date.now();
      }
      // Pointer capture in the renderer handles normal release; this recovers a lost release.
      if (Date.now() - dragLastMovementAt > 15000) {
        endDrag();
        return;
      }
      const targetDisplay = screen.getDisplayNearestPoint(cursor);
      activeDisplayId = targetDisplay.id;
      applyBounds(geometry.dragBounds(cursor, dragOffset, targetDisplay.workArea, settings().scale));
      motionX = petWindow.getBounds().x;
    }
    sendSnapshot();
  }, 32);
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  await petWindow.loadFile(PET_FILE);
  savePosition();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (isPetAlive()) petWindow.showInactive(); });
  app.on('before-quit', () => {
    quitting = true;
    if (ticker) clearInterval(ticker);
    if (positionTimer) clearTimeout(positionTimer);
    savePosition();
    if (tray) tray.destroy();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(createPet).catch(error => {
    console.error('Unable to start Usagi:', error);
    app.quit();
  });
}
