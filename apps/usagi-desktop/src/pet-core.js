(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UsagiPetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WIDTH = 192;
  const HEIGHT = 208;
  const DEADZONE = 18;
  const DIRECTION_STEP = 22.5;
  const DIRECTION_HYSTERESIS = 3.5;
  const ANIMATIONS = Object.freeze({
    idle: { row: 0, durations: [280, 110, 110, 140, 140, 320], label: "安静陪伴" },
    "running-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220], label: "向右跑" },
    "running-left": { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220], label: "向左跑" },
    waving: { row: 3, durations: [140, 140, 140, 280], label: "打个招呼" },
    jumping: { row: 4, durations: [140, 140, 140, 140, 280], label: "跳起来" },
    failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240], label: "有点泄气" },
    waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260], label: "等你回应" },
    running: { row: 7, durations: [120, 120, 120, 120, 120, 220], label: "认真忙碌" },
    review: { row: 8, durations: [150, 150, 150, 150, 150, 280], label: "仔细看看" }
  });
  Object.values(ANIMATIONS).forEach(function (animation) {
    Object.freeze(animation.durations);
    Object.freeze(animation);
  });

  function directionFromOffset(dx, dy, currentDirection = -1) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < DEADZONE) return -1;
    const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    if (Number.isInteger(currentDirection) && currentDirection >= 0 && currentDirection < 16) {
      const difference = ((angle - currentDirection * DIRECTION_STEP + 540) % 360) - 180;
      if (Math.abs(difference) <= DIRECTION_STEP / 2 + DIRECTION_HYSTERESIS) return currentDirection;
    }
    return Math.round(angle / DIRECTION_STEP) % 16;
  }

  function animationDuration(id) {
    const animation = ANIMATIONS[id];
    if (!animation) throw new RangeError("Unknown animation: " + id);
    return animation.durations.reduce(function (total, duration) { return total + duration; }, 0);
  }

  function frameAt(id, elapsedMs, loop = true) {
    const animation = ANIMATIONS[id];
    if (!animation) throw new RangeError("Unknown animation: " + id);
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const duration = animationDuration(id);
    const done = !loop && elapsed >= duration;
    if (done) return { row: animation.row, column: animation.durations.length - 1, done: true };
    let offset = loop ? elapsed % duration : elapsed;
    for (let column = 0; column < animation.durations.length; column++) {
      if (offset < animation.durations[column]) return { row: animation.row, column: column, done: false };
      offset -= animation.durations[column];
    }
    return { row: animation.row, column: 0, done: false };
  }

  class PetController {
    constructor({ now = 0, roaming = true, lookAtCursor = true, paused = false, random = Math.random } = {}) {
      this.settings = { roaming: Boolean(roaming), lookAtCursor: Boolean(lookAtCursor), paused: Boolean(paused) };
      this.random = typeof random === "function" ? random : Math.random;
      this.state = "idle";
      this.dragging = false;
      this.direction = -1;
      this._lastNow = Number.isFinite(now) ? now : 0;
      this._startedAt = this._lastNow;
      this._mode = "idle";
      this._queuedAction = null;
      this._endsAt = Infinity;
      this._nextRoamAt = this._lastNow + this._restDuration();
    }

    _sample() {
      const sample = Number(this.random());
      return Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
    }

    _restDuration() { return 5000 + this._sample() * 7000; }
    _runDuration() { return 3000 + this._sample() * 3000; }

    _time(now) {
      this._lastNow = Math.max(this._lastNow, Number.isFinite(now) ? now : this._lastNow);
      return this._lastNow;
    }

    _idle(now) {
      this.state = "idle";
      this._mode = "idle";
      this._queuedAction = null;
      this._startedAt = now;
      this._endsAt = Infinity;
      this._nextRoamAt = now + this._restDuration();
      this.direction = -1;
    }

    updateSettings(patch = {}) {
      const wasPaused = this.settings.paused;
      const wasRoaming = this.settings.roaming;
      ["roaming", "lookAtCursor", "paused"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(patch, key)) this.settings[key] = Boolean(patch[key]);
      });
      if (wasPaused !== this.settings.paused || (wasRoaming && !this.settings.roaming && this._mode === "roam")) {
        this._idle(this._lastNow);
      }
      if (!this.settings.lookAtCursor) this.direction = -1;
      return this;
    }

    interact(region, now) {
      const actions = { ear: "jumping", face: "waving", body: "waiting" };
      if (actions[region]) this.play(actions[region], now);
      return this;
    }

    play(id, now) {
      if (!ANIMATIONS[id]) throw new RangeError("Unknown animation: " + id);
      const time = this._time(now);
      if (this.dragging || this.settings.paused) return this;
      if (id === "idle") this._idle(time);
      else if ((this._mode === "action" || this._mode === "run-to-action") && time < this._endsAt) {
        this._queuedAction = id;
      } else if (this._mode === "roam" && time < this._endsAt) {
        this._queuedAction = id;
        this._mode = "run-to-action";
        const duration = animationDuration(this.state);
        this._endsAt = this._startedAt + (Math.floor((time - this._startedAt) / duration) + 1) * duration;
      } else {
        this._beginAction(id, time);
      }
      return this;
    }

    _beginAction(id, now) {
      this.state = id;
      this._mode = "action";
      this._startedAt = now;
      this._endsAt = now + animationDuration(id);
      this._queuedAction = null;
      this.direction = -1;
    }

    setDragging(dragging, now) {
      const time = this._time(now);
      const value = Boolean(dragging);
      if (value === this.dragging) return this;
      this.dragging = value;
      this._idle(time);
      return this;
    }

    step(now, input = {}) {
      const time = this._time(now);
      if (this.settings.paused) {
        return { state: "idle", row: 0, column: 0, moving: false, speed: 0, done: false };
      }
      if (this.dragging) {
        const frame = frameAt("waiting", time - this._startedAt);
        return { state: "waiting", ...frame, moving: false, speed: 0 };
      }

      let completed = false;
      const hitEdge = (this.state === "running-left" && input.atLeftEdge) ||
        (this.state === "running-right" && input.atRightEdge);
      if (this._mode !== "idle" && (time >= this._endsAt || hitEdge)) {
        completed = true;
        const queued = this._queuedAction;
        this._idle(time);
        if (queued) this._beginAction(queued, time);
      } else if (this._mode === "idle" && this.settings.roaming && time >= this._nextRoamAt) {
        if (!(input.atLeftEdge && input.atRightEdge)) {
          this.state = input.atLeftEdge ? "running-right" : input.atRightEdge ? "running-left" :
            this._sample() < 0.5 ? "running-left" : "running-right";
          this._mode = "roam";
          this._startedAt = time;
          this._endsAt = time + this._runDuration();
          this.direction = -1;
        } else this._nextRoamAt = time + this._restDuration();
      }

      let frame = frameAt(this.state, time - this._startedAt, this._mode !== "action");
      if (this.state === "idle" && this.settings.lookAtCursor && input.nearCursor !== false) {
        this.direction = directionFromOffset(input.cursorDx, input.cursorDy, this.direction);
        if (this.direction >= 0) frame = { row: 9 + Math.floor(this.direction / 8), column: this.direction % 8, done: false };
      } else this.direction = -1;
      const speed = this.state === "running-right" ? 45 : this.state === "running-left" ? -45 : 0;
      return { state: this.state, ...frame, moving: speed !== 0, speed, done: completed || frame.done };
    }
  }

  return { WIDTH, HEIGHT, ANIMATIONS, directionFromOffset, animationDuration, frameAt, PetController };
});
