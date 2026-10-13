"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const core = require("../src/pet-core.js");
const { ANIMATIONS, PetController, directionFromOffset, frameAt, animationDuration } = core;

test("browser and CommonJS receive the same public API", () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/pet-core.js"), "utf8"), sandbox);
  assert.equal(sandbox.UsagiPetCore.WIDTH, 192);
  assert.equal(sandbox.UsagiPetCore.HEIGHT, 208);
  assert.equal(Object.keys(sandbox.UsagiPetCore.ANIMATIONS).length, 9);
});

test("all sixteen clockwise gaze directions and the deadzone", () => {
  for (let direction = 0; direction < 16; direction++) {
    const angle = direction * Math.PI / 8;
    assert.equal(directionFromOffset(Math.sin(angle) * 100, -Math.cos(angle) * 100), direction);
  }
  assert.equal(directionFromOffset(0, 0, 4), -1);
  assert.equal(directionFromOffset(17.9, 0, 4), -1);
  assert.equal(directionFromOffset(18, 0), 4);
  assert.equal(directionFromOffset(NaN, 10), -1);
});

test("gaze hysteresis stops jitter at a direction boundary and wraps the seam", () => {
  const gaze = (angle, current) => directionFromOffset(Math.sin(angle * Math.PI / 180) * 100,
    -Math.cos(angle * Math.PI / 180) * 100, current);
  assert.equal(gaze(12, 0), 0);
  assert.equal(gaze(15, 0), 1);
  assert.equal(gaze(11, 1), 1);
  assert.equal(gaze(7, 1), 0);
  assert.equal(gaze(348, 0), 0);
  assert.equal(gaze(344, 0), 15);
});

test("animation timing reads only populated cells through exact loop boundaries", () => {
  let frames = 0;
  for (const [id, animation] of Object.entries(ANIMATIONS)) {
    let elapsed = 0;
    animation.durations.forEach((duration, column) => {
      assert.deepEqual(frameAt(id, elapsed), { row: animation.row, column, done: false });
      assert.equal(frameAt(id, elapsed + duration - 0.001).column, column);
      elapsed += duration;
      frames++;
    });
    assert.equal(frameAt(id, elapsed).column, 0);
    assert.deepEqual(frameAt(id, elapsed, false), { row: animation.row, column: animation.durations.length - 1, done: true });
    assert.equal(frameAt(id, elapsed * 100 + 1).column, 0);
  }
  assert.equal(frames, 57);
  assert.throws(() => frameAt("missing", 0), RangeError);
});

test("ear, face and body each play once completely then return to idle", () => {
  for (const [region, action] of Object.entries({ ear: "jumping", face: "waving", body: "waiting" })) {
    const pet = new PetController({ now: 10, roaming: false });
    pet.interact(region, 20);
    assert.equal(pet.step(20).state, action);
    assert.equal(pet.step(20 + animationDuration(action) - 1).state, action);
    const completed = pet.step(20 + animationDuration(action));
    assert.equal(completed.state, "idle");
    assert.equal(completed.done, true);
    assert.equal(pet.step(10000).done, false);
  }
});

test("roaming waits, moves at signed speed, and stops at screen edges", () => {
  const pet = new PetController({ random: () => 0, lookAtCursor: false });
  assert.equal(pet.step(4999).moving, false);
  assert.equal(pet.step(5000).speed, -45);
  const edge = pet.step(5100, { atLeftEdge: true });
  assert.equal(edge.state, "idle");
  assert.equal(edge.moving, false);
  assert.equal(pet.step(10100, { atLeftEdge: true }).speed, 45);
  assert.equal(pet.step(13100).state, "idle");
});

test("gaze uses extended rows only while idle and leaves cursor proximity cleanly", () => {
  const pet = new PetController({ roaming: false });
  assert.equal(pet.step(0, { cursorDx: 100, cursorDy: 0, nearCursor: true }).row, 9);
  assert.equal(pet.step(1, { cursorDx: -100, cursorDy: 0, nearCursor: true }).row, 10);
  assert.equal(pet.step(2, { cursorDx: -100, cursorDy: 0, nearCursor: false }).row, 0);
  pet.interact("ear", 3);
  assert.equal(pet.step(4, { cursorDx: 100, cursorDy: 0 }).row, 4);
});

test("pause and dragging never move; clicks cannot interrupt drag", () => {
  const pet = new PetController({ random: () => 0 });
  assert.equal(pet.step(5000).moving, true);
  pet.setDragging(true, 5100);
  pet.interact("ear", 5200);
  assert.equal(pet.step(5300).state, "idle");
  assert.equal(pet.step(5300).moving, false);
  pet.updateSettings({ paused: true });
  assert.equal(pet.step(9000).state, "idle");
  assert.equal(pet.step(9000).moving, false);
  pet.updateSettings({ paused: false });
  assert.equal(pet.step(9001).state, "idle");
  pet.setDragging(false, 9100);
  assert.equal(pet.step(9101).state, "idle");
  pet.updateSettings({ roaming: false });
  assert.equal(pet.step(100000).moving, false);
});

test("drag animation follows horizontal direction without restarting phase or moving the window", () => {
  const pet = new PetController({ roaming: false, lookAtCursor: false });
  pet.setDragging(true, 100);
  assert.equal(pet.step(110, { dragDx: 2 }).state, "running-right");
  const forward = pet.step(350, { dragDx: 3 });
  assert.equal(forward.column, 2);
  assert.equal(forward.row, 1);
  const reverse = pet.step(351, { dragDx: -2 });
  assert.equal(reverse.state, "running-left");
  assert.equal(reverse.row, 2);
  assert.equal(reverse.column, forward.column);
  const next = pet.step(470, { dragDx: -2 });
  assert.equal(next.column, 3);
  assert.equal(next.moving, false);
  assert.equal(next.speed, 0);
  const switchAgain = pet.step(471, { dragDx: 1 });
  assert.equal(switchAgain.state, "running-right");
  assert.equal(switchAgain.column, 3);
  assert.equal(switchAgain.moving, false);
});

test("fresh, vertical and stopped drags remain idle; horizontal motion lingers for at most 120 ms", () => {
  const pet = new PetController({ roaming: false });
  pet.setDragging(true, 100);
  assert.equal(pet.step(100).state, "idle");
  assert.equal(pet.step(105, { dragDx: 0 }).state, "idle");
  assert.equal(pet.step(110, { dragDx: 1 }).state, "running-right");
  assert.equal(pet.step(230, { dragDx: 0.99 }).state, "running-right");
  assert.equal(pet.step(231, { dragDx: -0.99 }).state, "idle");
  assert.equal(pet.step(1000, { dragDx: NaN }).state, "idle");
  assert.equal(pet.step(1001, { dragDx: -1 }).state, "running-left");
});

test("turning roaming off preserves manual dragging but prevents subsequent autonomous motion", () => {
  const pet = new PetController({ random: () => 0 });
  assert.equal(pet.step(5000).moving, true);
  pet.setDragging(true, 5100);
  pet.updateSettings({ roaming: false });
  const drag = pet.step(5200, { dragDx: 4 });
  assert.equal(drag.state, "running-right");
  assert.equal(drag.moving, false);
  assert.equal(drag.speed, 0);
  pet.setDragging(false, 5300);
  assert.equal(pet.step(100000).state, "idle");
});

test("paused pets still animate manual dragging and pause toggles retain its frame phase", () => {
  const pet = new PetController({ paused: true });
  pet.setDragging(true, 200);
  assert.equal(pet.step(250, { dragDx: -1 }).state, "running-left");
  const forward = pet.step(490, { dragDx: 2 });
  assert.equal(forward.state, "running-right");
  assert.equal(forward.column, 2);
  pet.updateSettings({ paused: false });
  const reverse = pet.step(510, { dragDx: -2 });
  assert.equal(reverse.column, 2);
  pet.updateSettings({ paused: true });
  assert.equal(pet.step(511, { dragDx: -1 }).column, 2);
  pet.setDragging(false, 600);
  assert.deepEqual(pet.step(601), { state: "idle", row: 0, column: 0, moving: false, speed: 0, done: false });
});

test("release resets direction, rests for the normal interval, then restores autonomous roaming", () => {
  for (const sample of [0, 1]) {
    const pet = new PetController({ random: () => sample, lookAtCursor: false });
    pet.setDragging(true, 100);
    assert.equal(pet.step(150, { dragDx: -3 }).state, "running-left");
    pet.setDragging(false, 200);
    assert.equal(pet.step(200).state, "idle");
    const rest = sample === 0 ? 5000 : 12000;
    assert.equal(pet.step(200 + rest - 1).moving, false);
    const resumed = pet.step(200 + rest);
    assert.equal(resumed.moving, true);
    assert.equal(Math.abs(resumed.speed), 45);
    pet.setDragging(true, 200 + rest + 10);
    assert.equal(pet.step(200 + rest + 11).state, "idle");
  }
});

test("repeated clicks preserve a whole action and retain only the latest next action", () => {
  const pet = new PetController({ roaming: false });
  pet.interact("ear", 0);
  pet.interact("face", 100);
  pet.interact("body", 200);
  assert.equal(pet.step(300).state, "jumping");
  assert.equal(pet.step(300).column, 2);
  assert.equal(pet.step(839).state, "jumping");
  assert.equal(pet.step(840).state, "waiting");
  assert.equal(pet.step(840).column, 0);
  assert.equal(pet.step(1850).state, "idle");
});

test("click during roaming stops after the current run cycle and plays its queued action", () => {
  const pet = new PetController({ random: () => 0 });
  assert.equal(pet.step(5000).state, "running-left");
  pet.interact("face", 5200);
  assert.equal(pet.step(6000).state, "running-left");
  assert.equal(pet.step(6060).state, "waving");
  assert.equal(pet.step(6060).moving, false);
  assert.equal(pet.step(6760).state, "idle");
});

test("drag and pause clear queued clicks", () => {
  const pet = new PetController({ roaming: false });
  pet.interact("ear", 0);
  pet.interact("face", 100);
  pet.setDragging(true, 200);
  pet.setDragging(false, 300);
  assert.equal(pet.step(1000).state, "idle");
  pet.interact("ear", 1100);
  pet.interact("face", 1200);
  pet.updateSettings({ paused: true });
  pet.updateSettings({ paused: false });
  assert.equal(pet.step(2500).state, "idle");
});

test("long-running deterministic steps remain inside the populated atlas", () => {
  const pet = new PetController({ random: () => 0.7 });
  for (let now = 0; now < 3600000; now += 37) {
    if (now % 703 === 0) pet.interact("face", now);
    const frame = pet.step(now, { cursorDx: Math.sin(now / 300) * 100, cursorDy: Math.cos(now / 300) * 100,
      atRightEdge: now % 999 < 50 });
    assert.ok(frame.row >= 0 && frame.row <= 10);
    assert.ok(frame.column >= 0 && frame.column < 8);
    if (frame.row < 9) assert.ok(frame.column < ANIMATIONS[frame.state].durations.length);
    assert.equal(frame.moving, frame.speed !== 0);
  }
});
