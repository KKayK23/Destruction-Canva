// 畫布與 DOM 實例集中管理：所有模組共用同一組 canvas / context。
export const canvas = document.querySelector("#artwork");
export const context = canvas.getContext("2d", { alpha: false });
export const hint = document.querySelector("#hint");
export const resetButton = document.querySelector("#reset");
export const brushCursor = document.querySelector("#brushCursor");
export const exportButton = document.querySelector("#export");
export const exportMenu = document.querySelector("#exportMenu");
export const uploadButton = document.querySelector("#upload");
export const uploadInput = document.querySelector("#uploadInput");
export const dropOverlay = document.querySelector("#dropOverlay");
export const toast = document.querySelector("#toast");
export const modeButtons = {
  smear: document.querySelector("#modeSmear"),
  glitch: document.querySelector("#modeGlitch"),
  rgbsplit: document.querySelector("#modeRGBSplit"),
  melt: document.querySelector("#modeMelt"),
  sticker: document.querySelector("#modeSticker")
};

export const sourceImage = new Image();

export const originalCanvas = document.createElement("canvas");
export const originalContext = originalCanvas.getContext("2d", { alpha: false });
export const brushCanvas = document.createElement("canvas");
export const brushContext = brushCanvas.getContext("2d");
// Glitch 手法：區域像素處理緩衝（保留透明度，才能做柔邊烘焙）
export const glitchCanvas = document.createElement("canvas");
export const glitchContext = glitchCanvas.getContext("2d", { willReadFrequently: true });
export const trimCanvas = document.createElement("canvas");
export const trimContext = trimCanvas.getContext("2d", { willReadFrequently: true });
// Melt 手法：水流批次繪製緩衝（先畫所有水流再一次性 blur 合成，避免逐個 filter 造成卡頓）
export const meltBufferCanvas = document.createElement("canvas");
export const meltBufferContext = meltBufferCanvas.getContext("2d");
