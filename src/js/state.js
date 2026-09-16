// 集中管理可變狀態：各手法模組透過 import 讀寫，避免散落的全域變數。
export const pointer = {
  x: 0, y: 0, previousX: 0, previousY: 0,
  active: false, carryingPaint: false, down: false,
  pressX: 0, pressY: 0, pressedAt: 0,
  longPressEligible: false, lastVortexFrame: 0
};
// 預設畫作會裁除四周白邊；上傳圖片則於載入時重新計算。
export const view = {
  pixelRatio: 1,
  artworkRect: { x: 0, y: 0, width: 0, height: 0 },
  sourceRect: { x: 170, y: 82, width: 682, height: 840 }
};
export const session = {
  hasInteracted: false,
  activeMode: "smear",
  hintFadeTimer: null,
  toastTimer: 0
};
// Glitch 手法：掃動佇列與速度能量
export const glitchState = {
  queue: [],
  trail: { lastX: 0, lastY: 0, hasPoint: false },
  energy: 0,
  lastMoveAt: 0,
  source: null
};
export const MODE_HINTS = {
  smear: "移動滑鼠，攪動畫面",
  rgbsplit: "掃過畫面，拉出色差",
  glitch: "點擊畫面，隨機數位損壞",
  melt: "長按畫面，顏料融化滴落"
};
// Melt 手法：融化緩衝與節流
export const meltState = {
  canvas: document.createElement("canvas"),
  source: document.createElement("canvas"),
  drip: { active: false, tipY: 0, x: 0, y: 0 },
  lastFrame: 0,
  pressStart: 0
};
export const meltContext = meltState.canvas.getContext("2d", { willReadFrequently: true });
export const meltSourceContext = meltState.source.getContext("2d");
