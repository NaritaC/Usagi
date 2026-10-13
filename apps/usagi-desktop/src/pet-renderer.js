'use strict';
const api = window.usagiDesktop;
const core = window.UsagiPetCore;
const assets = window.UsagiAssets;
const canvas = document.getElementById('pet');
const context = canvas.getContext('2d', {willReadFrequently:true});
const controller = new core.PetController({now:performance.now()});
const atlas = new Image();
const GROUND_Y = 194;
let snapshot, ready = false, lastTime = null, pixels, lastHit = null, press = null;
let moveElapsed = 0, pendingMove = 0, lastFrameKey = '';
let pendingDragDx = 0;
function frameOffset(row) {return GROUND_Y - assets.rows[row].groundY;}
function draw(frame) {
  const mirrored=frame.state==='running-left';
  const sourceRow=mirrored ? core.ANIMATIONS['running-right'].row : frame.row;
  const key = `${sourceRow}:${frame.column}:${mirrored}`;
  canvas.dataset.row = String(frame.row);
  canvas.dataset.sourceRow = String(sourceRow);
  canvas.dataset.mirrored = String(mirrored);
  canvas.dataset.column = String(frame.column);
  canvas.dataset.state = frame.state;
  if (key === lastFrameKey) return;
  lastFrameKey = key;
  context.clearRect(0,0,192,208);
  context.save();
  if (mirrored) {context.translate(192,0);context.scale(-1,1);}
  context.drawImage(atlas,frame.column*192,sourceRow*208,192,208,0,frameOffset(sourceRow),192,208);
  context.restore();
  pixels = context.getImageData(0,0,192,208).data;
}
function pointInPet(cursor) {
  if (!snapshot) return {x:-1,y:-1};
  return {x:(cursor.x-snapshot.bounds.x)*192/snapshot.bounds.width,y:(cursor.y-snapshot.bounds.y)*208/snapshot.bounds.height};
}
function opaqueAt(point) {
  const x = Math.floor(point.x), y = Math.floor(point.y);
  return Boolean(pixels && x>=0 && x<192 && y>=0 && y<208 && pixels[(y*192+x)*4+3]>24);
}
function updateHit() {
  if (!snapshot) return;
  const hit = Boolean(press || snapshot.dragging || opaqueAt(pointInPet(snapshot.cursor)));
  if (hit !== lastHit) {api.setHit(hit);lastHit=hit;}
}
function regionAt(point) {
  const cell = assets.cells.find(cell => cell.row === Number(canvas.dataset.sourceRow) && cell.column === Number(canvas.dataset.column));
  if (!cell) return 'body';
  const top = cell.bounds.top+frameOffset(cell.row);
  const ratio = (point.y-top)/(cell.bounds.bottom-cell.bounds.top+1);
  return ratio < 0.34 ? 'ear' : ratio < 0.68 ? 'face' : 'body';
}
function acceptSnapshot(next) {
  const previousCursor=snapshot?.cursor;
  snapshot=next;
  if (press && press.dragging) {
    if (next.dragging) press.nativeActive=true;
    else if (press.nativeActive) release(null,true);
  }
  controller.updateSettings(next.settings);
  controller.setDragging(next.dragging || Boolean(press?.dragging),performance.now());
  if (press && !press.dragging && Math.hypot(next.cursor.x-press.origin.x,next.cursor.y-press.origin.y)>5) {
    press.dragging=true;
    controller.setDragging(true,performance.now());
    api.beginDrag();
    canvas.classList.add('grabbed');
  }
  if (next.dragging || press?.dragging) {
    if (previousCursor) pendingDragDx+=next.cursor.x-previousCursor.x;
  } else pendingDragDx=0;
  updateHit();
}
api.getState().then(acceptSnapshot);
api.onTick(acceptSnapshot);
api.onAction(id => {if(ready) controller.play(id,performance.now());});
canvas.addEventListener('pointerdown', event => {
  if (event.button!==0 || !snapshot || !opaqueAt(pointInPet(snapshot.cursor))) return;
  event.preventDefault();
  press={origin:{...snapshot.cursor},region:regionAt(pointInPet(snapshot.cursor)),dragging:false,pointerId:event.pointerId};
  canvas.setPointerCapture(event.pointerId);
  updateHit();
});
function release(event, cancelled=false) {
  if (!press) return;
  const previous=press;
  press=null;
  pendingDragDx=0;
  if (canvas.hasPointerCapture(previous.pointerId)) canvas.releasePointerCapture(previous.pointerId);
  canvas.classList.remove('grabbed');
  if (previous.dragging) {api.endDrag();controller.setDragging(false,performance.now());}
  else if (!cancelled) controller.interact(previous.region,performance.now());
  updateHit();
}
canvas.addEventListener('pointerup', event => release(event));
canvas.addEventListener('pointercancel', event => release(event,true));
canvas.addEventListener('lostpointercapture', event => release(event,true));
window.addEventListener('blur', event => release(event,true));
window.addEventListener('keydown', event => {if(event.key==='Escape')release(event,true);});
canvas.addEventListener('contextmenu', event => {event.preventDefault();release(event,true);api.openSettings();});
atlas.onload = () => {
  if(atlas.naturalWidth!==1536 || atlas.naturalHeight!==2288) return fail();
  ready=true;
  canvas.dataset.ready='true';
  requestAnimationFrame(tick);
};
atlas.onerror = fail;
function fail() {
  document.getElementById('error').hidden=false;
  api.setHit(true);
}
function tick(now) {
  const delta=lastTime===null?0:Math.min(100,now-lastTime);
  lastTime=now;
  if(snapshot) {
    const b=snapshot.bounds,w=snapshot.workArea;
    const onDisplay=snapshot.cursor.x>=w.x && snapshot.cursor.x<w.x+w.width && snapshot.cursor.y>=w.y && snapshot.cursor.y<w.y+w.height;
    const frame=controller.step(now,{
      cursorDx:(snapshot.cursor.x-b.x-b.width/2)/snapshot.settings.scale,
      cursorDy:(snapshot.cursor.y-b.y-b.height*0.52)/snapshot.settings.scale,
      nearCursor:onDisplay,
      dragDx:pendingDragDx,
      atLeftEdge:b.x<=w.x+1,
      atRightEdge:b.x+b.width>=w.x+w.width-1
    });
    pendingDragDx=0;
    draw(frame);
    updateHit();
    if(frame.moving && !press && !snapshot.dragging) {
      pendingMove+=frame.speed*delta/1000;
      moveElapsed+=delta;
      if(moveElapsed>=32) {api.moveBy(pendingMove);pendingMove=0;moveElapsed=0;}
    } else {pendingMove=0;moveElapsed=0;}
  }
  requestAnimationFrame(tick);
}
atlas.src='../assets/spritesheet.webp';
