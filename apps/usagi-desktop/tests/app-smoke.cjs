'use strict';
// This test controls only the app under test. It restores the real pointer and
// uses an isolated settings directory, never the user's saved pet settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {_electron:electron} = require('playwright');
const root = path.resolve(__dirname,'..');
const output = path.join(root,'test-results');
fs.mkdirSync(output,{recursive:true});
const userData = fs.mkdtempSync(path.join(output,'profile-'));
const pointerScript = path.join(__dirname,'native-input.ps1');
const report = {platform:process.platform,checks:[],errors:[],startedAt:new Date().toISOString()};
const isolatedInput=process.env.USAGI_SMOKE_ISOLATED_INPUT==='1';
report.pointerMode=isolatedInput?'isolated Electron pointer events and simulated global coordinates':'real Windows pointer';
function input(x,y,button='none') {
  execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',pointerScript,'-X',String(Math.round(x)),'-Y',String(Math.round(y)),'-Button',button],{windowsHide:true,stdio:'pipe'});
}
function readPointer() {
  return JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',pointerScript,'-Read'],{windowsHide:true,encoding:'utf8'}));
}
let application, originalPointer, held=false;
const executablePath = process.env.USAGI_TEST_EXECUTABLE || require('electron');
async function launch() {
  const env = {...process.env,USAGI_USER_DATA:userData};
  delete env.ELECTRON_RUN_AS_NODE;
  application=await electron.launch({executablePath,args:process.env.USAGI_TEST_EXECUTABLE?[]:[root],env,timeout:30000});
  if(isolatedInput) await application.evaluate(({screen})=>{
    screen.__usagiTestCursor={x:0,y:0};
    screen.getCursorScreenPoint=()=>({...screen.__usagiTestCursor});
  });
  const page=await application.firstWindow();
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.locator('#pet[data-ready=true]').waitFor({timeout:15000});
  for(let attempt=0;attempt<30;attempt++) {
    if(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())) break;
    await page.waitForTimeout(100);
  }
  return page;
}
async function state(page){return page.evaluate(()=>window.usagiDesktop.getState());}
async function physical(point){return application.evaluate(({screen},point)=>screen.dipToScreenPoint(point),point);}
async function move(point,button='none') {
  if(isolatedInput) {
    await application.evaluate(({screen},point)=>{screen.__usagiTestCursor={...point};},point);
    const page=application.windows().find(page=>page.url().endsWith('/pet.html'));
    const s=await state(page);
    await page.mouse.move(point.x-s.bounds.x,point.y-s.bounds.y);
    if(button==='down')await page.mouse.down();
    if(button==='up')await page.mouse.up();
  } else {const p=await physical(point);input(p.x,p.y,button);}
}
async function waitFor(page,fn,arg,timeout=5000){
  try {await page.waitForFunction(fn,arg,{timeout});}
  catch(error) {
    report.lastState=await page.evaluate(async()=>({snapshot:await window.usagiDesktop.getState(),frame:{...document.getElementById('pet')?.dataset}}));
    throw error;
  }
}
function check(name){report.checks.push(name);process.stdout.write(`PASS ${name}\n`);}
(async()=>{
  assert.equal(process.platform,'win32','Native smoke test targets Windows');
  if(!isolatedInput) {
    originalPointer=readPointer();
    assert.equal(originalPointer.leftButtonDown,false,'Release the mouse button before running the native pointer test');
  }
  let page=await launch();
  report.runtime=await application.evaluate(({app,screen})=>({appVersion:app.getVersion(),electron:process.versions.electron,displays:screen.getAllDisplays().map(({bounds,workArea,scaleFactor})=>({bounds,workArea,scaleFactor})),packaged:app.isPackaged}));
  report.runtime.windowsVersion=require('node:os').release();
  await page.evaluate(()=>window.usagiDesktop.updateSettings({roaming:false,lookAtCursor:false}));
  let s=await state(page);
  assert.equal(s.bounds.width,112);assert.equal(s.bounds.height,121);
  assert.ok(Math.abs(s.bounds.y+194*s.settings.scale-s.workArea.y-s.workArea.height)<=1);
  const properties=await application.evaluate(({BrowserWindow})=>{
    const win=BrowserWindow.getAllWindows()[0];
    return {top:win.isAlwaysOnTop(),focusable:win.isFocusable(),resizable:win.isResizable(),visible:win.isVisible()};
  });
  assert.deepEqual(properties,{top:true,focusable:false,resizable:false,visible:true});
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  check('actual transparent, non-focusable native window launches with correct work-area grounding');
  await page.screenshot({path:path.join(output,'pet-idle.png'),omitBackground:true});
  const opaque=await page.evaluate(()=>{
    const c=document.getElementById('pet'),d=c.getContext('2d').getImageData(0,0,192,208).data;
    for(let y=85;y<140;y++)for(let x=70;x<120;x++)if(d[(y*192+x)*4+3]>240)return {x,y};
    throw new Error('No opaque face');
  });
  await move({x:s.bounds.x+opaque.x*s.settings.scale,y:s.bounds.y+opaque.y*s.settings.scale});
  await waitFor(page,async()=> (await window.usagiDesktop.getState()).interactive===true);
  await move({x:s.bounds.x+3,y:s.bounds.y+3});
  await waitFor(page,async()=> (await window.usagiDesktop.getState()).interactive===false);
  check('native hit mask follows rendered alpha while cursor gaze is disabled');
  await page.evaluate(()=>window.usagiDesktop.updateSettings({lookAtCursor:true}));
  await move({x:s.bounds.x+s.bounds.width/2,y:s.bounds.y-30});
  await waitFor(page,()=>document.getElementById('pet').dataset.row==='9' && document.getElementById('pet').dataset.column==='0');
  check('global cursor drives the correct upward gaze pose');
  await page.evaluate(()=>window.usagiDesktop.updateSettings({lookAtCursor:false}));
  await waitFor(page,()=>document.getElementById('pet').dataset.row==='0');
  await page.evaluate(()=>window.usagiDesktop.playAction('jumping'));
  await waitFor(page,()=>document.getElementById('pet').dataset.state==='jumping');
  await waitFor(page,()=>document.getElementById('pet').dataset.state==='idle');
  check('native action IPC plays and recovers from a complete jump');
  s=await state(page);
  const start={x:s.bounds.x+opaque.x*s.settings.scale,y:s.bounds.y+opaque.y*s.settings.scale};
  await move(start);
  await waitFor(page,async()=> (await window.usagiDesktop.getState()).interactive===true);
  if(isolatedInput) await page.evaluate(()=>{window.usagiDesktop.setHit(true);window.usagiDesktop.beginDrag();});
  else {await move(start,'down');held=true;}
  await page.waitForTimeout(120);
  const destination={x:start.x-90,y:start.y-100};
  await move(destination);
  await waitFor(page,async()=> (await window.usagiDesktop.getState()).dragging===true);
  await move({x:destination.x-45,y:destination.y-40});
  await page.waitForTimeout(120);
  const during=await state(page);
  assert.ok(during.bounds.y<s.bounds.y-30);
  if(isolatedInput) await page.evaluate(()=>window.usagiDesktop.endDrag());
  else {await move({x:destination.x-45,y:destination.y-40},'up');held=false;}
  await waitFor(page,async()=> (await window.usagiDesktop.getState()).dragging===false);
  const dropped=await state(page);
  assert.ok(Math.abs(dropped.bounds.y+194*dropped.settings.scale-dropped.workArea.y-dropped.workArea.height)<=1);
  check(isolatedInput?'isolated native drag API, release, and re-grounding work':'real Windows pointer drag, release, and re-grounding work');
  await page.evaluate(()=>window.usagiDesktop.updateSettings({scale:128/192,roaming:true,paused:false}));
  const scaled=await state(page);
  assert.equal(scaled.bounds.width,128);assert.equal(scaled.bounds.height,139);
  assert.ok(Math.abs(scaled.bounds.y+194*scaled.settings.scale-scaled.workArea.y-scaled.workArea.height)<=1);
  const beforeMove=scaled.bounds.x;
  await waitFor(page,()=>document.getElementById('pet').dataset.state.startsWith('running-'),undefined,15000);
  await page.waitForTimeout(200);
  assert.notEqual((await state(page)).bounds.x,beforeMove);
  await page.evaluate(()=>window.usagiDesktop.updateSettings({paused:true}));
  const pausedX=(await state(page)).bounds.x;
  await page.waitForTimeout(250);
  assert.equal((await state(page)).bounds.x,pausedX);
  check('scaling stays grounded, autonomous running moves, and pause stops movement');
  const newWindow=application.waitForEvent('window');
  await page.evaluate(()=>window.usagiDesktop.openSettings());
  const settingsPage=await newWindow;
  await settingsPage.locator('#scale-value').waitFor();
  await settingsPage.waitForFunction(()=>document.getElementById('scale-value').value==='128 px');
  await settingsPage.locator('#roaming').uncheck({force:true});
  await waitFor(settingsPage,async()=> !(await window.usagiDesktop.getState()).settings.roaming);
  await settingsPage.locator('#scale').focus();
  await settingsPage.locator('#scale').press('Home');
  await waitFor(settingsPage,async()=> (await window.usagiDesktop.getState()).settings.scale===80/192);
  await settingsPage.locator('#pause').click();
  await waitFor(settingsPage,async()=> !(await window.usagiDesktop.getState()).settings.paused);
  await settingsPage.screenshot({path:path.join(output,'settings.png')});
  const rejection=await settingsPage.evaluate(async()=>{
    try {await window.usagiDesktop.updateSettings({unknown:true});return false;}catch{return true;}
  });
  assert.equal(rejection,true);
  const persisted=JSON.parse(fs.readFileSync(path.join(userData,'settings.json'),'utf8'));
  assert.equal(persisted.settings.scale,80/192);assert.equal(persisted.settings.roaming,false);
  check('settings controls save exact values and reject invalid input');
  await application.close();application=null;
  page=await launch();
  s=await state(page);
  assert.equal(s.settings.scale,80/192);assert.equal(s.settings.roaming,false);assert.equal(s.settings.paused,false);
  check('settings and saved position survive a full app restart');
  const finished=application.process();
  await page.evaluate(()=>window.usagiDesktop.quit());
  await new Promise(resolve=>finished.once('exit',resolve));
  application=null;
  check('quit shuts down the native process');
  assert.deepEqual(report.errors,[],'Renderer exceptions');
  report.ok=true;
})().catch(error=>{
  report.ok=false;report.failure=error.stack;process.exitCode=1;process.stderr.write(`${error.stack}\n`);
}).finally(async()=>{
  if(held&&originalPointer)input(originalPointer.x,originalPointer.y,'up');
  if(application)await application.close().catch(()=>{});
  if(originalPointer)input(originalPointer.x,originalPointer.y);
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(output,'app-smoke.json'),JSON.stringify(report,null,2)+'\n');
});
