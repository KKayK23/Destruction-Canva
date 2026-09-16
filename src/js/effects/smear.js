// Smear（抹開）手法：沿滑鼠方向推開顏料並混合；長按產生旋渦。
import { canvas, context, brushCanvas, brushContext } from "../canvases.js";
import { view } from "../state.js";
export function mixPaint(x, y, directionX, directionY, speed) {
  const radius = Math.max(26, Math.min(40, view.artworkRect.width * 0.05));
  const diameter = Math.ceil(radius * 2);
  const sourceX = Math.round((x - radius) * view.pixelRatio);
  const sourceY = Math.round((y - radius) * view.pixelRatio);
  const sourceSize = Math.round(diameter * view.pixelRatio);

  if (sourceX < 0 || sourceY < 0 || sourceX + sourceSize > canvas.width || sourceY + sourceSize > canvas.height) {
    return;
  }

  brushCanvas.width = sourceSize;
  brushCanvas.height = sourceSize;
  brushContext.setTransform(1, 0, 0, 1, 0, 0);
  brushContext.clearRect(0, 0, sourceSize, sourceSize);
  brushContext.drawImage(canvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, sourceSize, sourceSize);

  const length = Math.hypot(directionX, directionY) || 1;
  const offset = Math.min(8, 2 + speed * 0.18);
  const offsetX = directionX / length * offset;
  const offsetY = directionY / length * offset;
  const blendBlur = Math.min(3, 1.5 + speed * 0.03);

  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  context.globalAlpha = 0.16;

  for (let layer = 1; layer <= 2; layer += 1) {
    const drift = layer / 2;
    context.drawImage(
      brushCanvas,
      x - radius + offsetX * drift,
      y - radius + offsetY * drift,
      diameter,
      diameter
    );
  }

  context.globalAlpha = 0.07;
  context.filter = `blur(${blendBlur}px)`;
  context.drawImage(
    brushCanvas,
    x - radius + offsetX * 0.75,
    y - radius + offsetY * 0.75,
    diameter,
    diameter
  );

  context.restore();
}

export function swirlPaint(x, y, heldFor) {
  const baseRadius = Math.max(30, Math.min(42, view.artworkRect.width * 0.06));
  const radius = Math.min(baseRadius + 34, baseRadius + Math.max(0, heldFor - 500) * 0.014);
  const diameter = Math.ceil(radius * 2);
  const sourceX = Math.round((x - radius) * view.pixelRatio);
  const sourceY = Math.round((y - radius) * view.pixelRatio);
  const sourceSize = Math.round(diameter * view.pixelRatio);

  if (sourceX < 0 || sourceY < 0 || sourceX + sourceSize > canvas.width || sourceY + sourceSize > canvas.height) {
    return;
  }

  brushCanvas.width = sourceSize;
  brushCanvas.height = sourceSize;
  brushContext.setTransform(1, 0, 0, 1, 0, 0);
  brushContext.clearRect(0, 0, sourceSize, sourceSize);
  brushContext.drawImage(canvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, sourceSize, sourceSize);

  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  context.translate(x, y);
  context.rotate(0.112);
  context.globalAlpha = 0.16;
  context.filter = "blur(0.5px)";
  context.drawImage(brushCanvas, -radius, -radius, diameter, diameter);
  context.restore();
}

