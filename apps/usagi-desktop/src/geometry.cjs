'use strict';

const BASE_WIDTH = 192;
const BASE_HEIGHT = 208;
const GROUND_Y = 194;

function petSize(scale) {
  if (!Number.isFinite(scale) || scale <= 0) throw new TypeError('Invalid pet scale');
  return { width: Math.round(BASE_WIDTH * scale), height: Math.round(BASE_HEIGHT * scale) };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function floorY(workArea, scale) {
  return Math.round(workArea.y + workArea.height - GROUND_Y * scale);
}

function groundBounds(workArea, scale, preferredX) {
  const size = petSize(scale);
  return {
    x: Math.round(clamp(preferredX, workArea.x, workArea.x + workArea.width - size.width)),
    y: floorY(workArea, scale),
    ...size,
  };
}

function initialBounds(workArea, scale) {
  const { width } = petSize(scale);
  return groundBounds(workArea, scale, workArea.x + workArea.width - width - 48);
}

function resizeGrounded(bounds, workArea, scale) {
  const { width } = petSize(scale);
  return groundBounds(workArea, scale, bounds.x + (bounds.width - width) / 2);
}

function dragBounds(cursor, offset, workArea, scale) {
  const size = petSize(scale);
  return {
    x: Math.round(clamp(cursor.x - offset.x, workArea.x, workArea.x + workArea.width - size.width)),
    y: Math.round(clamp(cursor.y - offset.y, workArea.y, floorY(workArea, scale))),
    ...size,
  };
}

function overlapArea(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function distanceToRect(point, rect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width);
  const dy = Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height);
  return dx * dx + dy * dy;
}

function displayForBounds(bounds, displays, fallbackDisplayId) {
  if (!displays.length) throw new Error('No displays available');
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  return [...displays].sort((a, b) => {
    const rectA = a.bounds || a.workArea;
    const rectB = b.bounds || b.workArea;
    return overlapArea(bounds, rectB) - overlapArea(bounds, rectA)
      || distanceToRect(center, rectA) - distanceToRect(center, rectB)
      || Number(b.id === fallbackDisplayId) - Number(a.id === fallbackDisplayId);
  })[0];
}

module.exports = {
  BASE_WIDTH, BASE_HEIGHT, GROUND_Y, petSize, floorY, groundBounds, initialBounds,
  resizeGrounded, dragBounds, displayForBounds,
};
