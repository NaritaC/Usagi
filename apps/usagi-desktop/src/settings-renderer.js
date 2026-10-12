'use strict';
const api = window.usagiDesktop;
const controls = ['roaming', 'lookAtCursor', 'alwaysOnTop', 'scale'];
let settings;
const status = document.getElementById('save-status');
function sync(next) {
  settings = next;
  for (const key of controls) {
    const element = document.getElementById(key);
    if (key === 'scale') element.value = Math.round(next[key]*192); else element.checked = next[key];
  }
  document.getElementById('scale-value').value = `${Math.round(next.scale * 192)} px`;
  document.getElementById('pause').textContent = next.paused ? '继续陪伴' : '休息一下';
}
let saveChain = Promise.resolve();
function save(patch) {
  status.textContent = '正在保存…';
  saveChain = saveChain.catch(() => {}).then(async () => {
    try {
      sync(await api.updateSettings(patch));
      status.dataset.error = 'false';
      status.textContent = '已经保存，下次见面也记得。';
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = '保存失败，请重试。';
      sync((await api.getState()).settings);
    }
  });
}
controls.forEach(key => document.getElementById(key).addEventListener('change', event => save({[key]:key === 'scale' ? Number(event.target.value)/192 : event.target.checked})));
document.getElementById('scale').addEventListener('input', event => {document.getElementById('scale-value').value = `${Number(event.target.value)} px`;});
document.getElementById('pause').addEventListener('click', () => save({paused:!settings.paused}));
document.getElementById('reset').addEventListener('click', () => api.resetPosition());
document.getElementById('quit').addEventListener('click', () => api.quit());
let previewAction = 'idle', previewStart = performance.now();
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
  api.playAction(button.dataset.action);
  previewAction = button.dataset.action;
  previewStart = performance.now();
}));
api.getState().then(snapshot => sync(snapshot.settings));
api.onTick(snapshot => {
  if (!settings || Object.keys(snapshot.settings).some(key => settings[key] !== snapshot.settings[key])) sync(snapshot.settings);
});
const image = new Image(), canvas = document.getElementById('preview'), context = canvas.getContext('2d');
image.onload = () => {
  function tick(now) {
    const frame = window.UsagiPetCore.frameAt(previewAction, now-previewStart, previewAction === 'idle');
    context.clearRect(0,0,192,208);
    context.drawImage(image,frame.column*192,frame.row*208,192,208,0,0,192,208);
    if (frame.done) {previewAction='idle';previewStart=now;}
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
};
image.src='../assets/spritesheet.webp';
