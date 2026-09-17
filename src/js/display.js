// 版面與顯示：畫作定位、縮放、重置、白邊裁切估計。
import { canvas, context, originalCanvas, originalContext, trimCanvas, trimContext, sourceImage, hint } from "./canvases.js";
import { pointer, view, session, glitchState } from "./state.js";
import { clearTears } from "./effects/tear.js";

export function fitArtwork() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isCompact = Math.min(viewportWidth, viewportHeight) < 620;
  const margin = isCompact ? 16 : 24;
  const availableWidth = viewportWidth - margin * 2;
  const availableHeight = isCompact
    ? viewportHeight - margin * 2
    : viewportHeight * 0.78;
  const scale = Math.min(availableWidth / view.sourceRect.width, availableHeight / view.sourceRect.height);
  const width = view.sourceRect.width * scale;
  const height = view.sourceRect.height * scale;

  view.artworkRect = {
    x: (viewportWidth - width) / 2,
    y: (viewportHeight - height) / 2,
    width,
    height
  };
}

export function drawBackground(targetContext) {
  const width = canvas.width / view.pixelRatio;
  const height = canvas.height / view.pixelRatio;
  targetContext.fillStyle = "#fff";
  targetContext.fillRect(0, 0, width, height);

  targetContext.save();
  targetContext.shadowColor = "rgba(35, 27, 18, 0.2)";
  targetContext.shadowBlur = 24;
  targetContext.shadowOffsetY = 10;
  targetContext.drawImage(
    sourceImage,
    view.sourceRect.x,
    view.sourceRect.y,
    view.sourceRect.width,
    view.sourceRect.height,
    view.artworkRect.x,
    view.artworkRect.y,
    view.artworkRect.width,
    view.artworkRect.height
  );
  targetContext.restore();
}

export function resetArtwork() {
  if (!originalCanvas.width) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.drawImage(originalCanvas, 0, 0);
  context.restore();
  pointer.active = false;
  pointer.carryingPaint = false;
  pointer.down = false;
  pointer.longPressEligible = false;
  glitchState.queue.length = 0;
  glitchState.trail.hasPoint = false;
  glitchState.energy = 0;
  clearTears();
  session.hasInteracted = false;
  hint.classList.remove("hidden");
}

export function resizeCanvas() {
  view.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(window.innerWidth * view.pixelRatio);
  canvas.height = Math.round(window.innerHeight * view.pixelRatio);
  context.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);

  originalCanvas.width = canvas.width;
  originalCanvas.height = canvas.height;
  originalContext.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);
  fitArtwork();
  drawBackground(originalContext);
  resetArtwork();
}

export function isInsideArtwork(x, y) {
  const r = view.artworkRect;
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

// 估計上傳圖片的內容範圍，自動裁除四周均勻的白邊或透明邊。
export function computeSourceRect(image) {
  const sampleSize = 160;
  const scale = Math.min(sampleSize / image.naturalWidth, sampleSize / image.naturalHeight, 1);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  trimCanvas.width = width;
  trimCanvas.height = height;
  trimContext.clearRect(0, 0, width, height);
  trimContext.drawImage(image, 0, 0, width, height);

  let data;
  try {
    data = trimContext.getImageData(0, 0, width, height).data;
  } catch {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }

  const threshold = 244;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const isContent = data[index + 3] > 16
        && Math.min(data[index], data[index + 1], data[index + 2]) < threshold;
      if (isContent) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right - left < 1 || bottom - top < 1) {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }

  const padX = (right - left + 1) * 0.012;
  const padY = (bottom - top + 1) * 0.012;
  const startX = Math.max(0, (left - padX) / scale);
  const startY = Math.max(0, (top - padY) / scale);
  const endX = Math.min(image.naturalWidth, (right + 1 + padX) / scale);
  const endY = Math.min(image.naturalHeight, (bottom + 1 + padY) / scale);

  return {
    x: Math.round(startX),
    y: Math.round(startY),
    width: Math.max(1, Math.round(endX - startX)),
    height: Math.max(1, Math.round(endY - startY))
  };
}