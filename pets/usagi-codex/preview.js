"use strict";
const definitions = [
  ["idle", "安静陪伴", "呼吸、眨眼与轻微摆动", [280,110,110,140,140,320]],
  ["running-right", "向右跑", "交替迈步，白色毛球尾巴随身摆动", [120,120,120,120,120,120,120,220]],
  ["running-left", "向左跑", "保持相同的步态节奏", [120,120,120,120,120,120,120,220]],
  ["waving", "打个招呼", "抬手、轻挥，再放下", [140,140,140,280]],
  ["jumping", "跳起来", "蓄力、腾空、落下与缓冲", [140,140,140,140,280]],
  ["failed", "有点泄气", "受挫时垂下耳朵，再恢复精神", [140,140,140,140,140,140,140,240]],
  ["waiting", "等你回应", "期待地看过来，轻轻歪头", [150,150,150,150,150,260]],
  ["running", "认真忙碌", "专注思考的小动作", [120,120,120,120,120,220]],
  ["review", "仔细看看", "查看、思考，轻微点头", [150,150,150,150,150,280]]
];
const grid = document.querySelector("#grid"), atlas = new Image();
const rows = definitions.map(([id,title,description,durations], index) => {
  const card = document.createElement("article"); card.className = "card"; card.dataset.state = id;
  card.innerHTML = `<div class="stage"><canvas width="192" height="208" role="img" aria-label="${title}动画"></canvas></div><div class="card-body"><div class="card-head"><h2>${title}</h2><span class="number">${String(index+1).padStart(2,"0")} / ${durations.length} 帧</span></div><p>${description}</p><div class="controls"><button type="button" aria-label="暂停${title}">暂停</button><input type="range" min="0" max="${durations.length-1}" value="0" aria-label="${title}逐帧查看"><span class="frame">1/${durations.length}</span></div></div>`;
  grid.append(card);
  const item = {id,index,durations,card,ctx:card.querySelector("canvas").getContext("2d"),frame:0,row:index,elapsed:0,paused:false,cycles:0};
  card.querySelector("button").addEventListener("click", () => {item.paused=!item.paused; sync(item);});
  card.querySelector("input").addEventListener("input", event => {item.paused=true; item.frame=Number(event.target.value); item.row=index; item.elapsed=0; item.cycles=0; draw(item); sync(item);});
  return item;
});
let ready=false, last=null, globalPaused=false;
const host = () => document.querySelector("#timing").value === "host";
function sync(item) {const button=item.card.querySelector("button"); button.textContent=item.paused?"播放":"暂停"; button.setAttribute("aria-label", `${item.paused?"播放":"暂停"}${definitions[item.index][1]}`); button.setAttribute("aria-pressed",String(item.paused));}
function draw(item) {
  if (!ready) return;
  item.ctx.clearRect(0,0,192,208);
  item.ctx.drawImage(atlas,item.frame*192,item.row*208,192,208,0,0,192,208);
  const count=definitions[item.row][3].length;
  item.card.querySelector(".frame").textContent=`${item.frame+1}/${count}`;
  item.card.querySelector("input").value=item.row===item.index?item.frame:0;
  item.card.dataset.displayRow=String(item.row); item.card.dataset.displayFrame=String(item.frame);
}
function frameDuration(item) {return definitions[item.row][3][item.frame] * (host() && item.row===0 ? 6 : 1);}
function advance(delta) {
  if (!ready || globalPaused) return;
  for(const item of rows){
    if(item.paused) continue;
    item.elapsed += delta;
    while(item.elapsed>=frameDuration(item)){
      item.elapsed-=frameDuration(item); item.frame++;
      if(item.frame>=definitions[item.row][3].length){
        item.frame=0; item.cycles++;
        if(host() && item.row!==0 && item.cycles>=3){item.row=0; item.cycles=0;}
      }
    }
    draw(item);
  }
}
function tick(now){if(last!==null) advance(Math.min(now-last,250)*Number(document.querySelector("#speed").value)); last=now; requestAnimationFrame(tick);}
document.querySelector("#toggle").addEventListener("click",event=>{globalPaused=!globalPaused; event.target.textContent=globalPaused?"全部播放":"全部暂停"; event.target.setAttribute("aria-pressed",String(globalPaused));});
document.querySelector("#background").addEventListener("change",event=>grid.dataset.background=event.target.value);
document.querySelector("#timing").addEventListener("change",()=>{rows.forEach(item=>{item.frame=0;item.row=item.index;item.cycles=0;item.elapsed=0;draw(item);});});
atlas.onload=()=>{const status=document.querySelector("#status");if(atlas.naturalWidth!==1536||atlas.naturalHeight!==1872){status.dataset.error="true";status.textContent="图集尺寸不正确，请重新复制完整宠物包。";return;}ready=true; rows.forEach(draw); status.textContent="已读取：9 组动画 · 57 个姿态 · 透明背景 · 1536 × 1872"; requestAnimationFrame(tick);};
atlas.onerror=()=>{const status=document.querySelector("#status");status.dataset.error="true";status.textContent="未找到图集，请把 spritesheet.webp 与此预览页放在同一个文件夹。";};
atlas.src="spritesheet.webp";
