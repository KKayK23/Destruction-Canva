// 應用程式進入點：動畫迴圈、指標事件與啟動流程。
import { canvas, context, hint, brushCursor, resetButton, sourceImage } from "./canvases.js";
import { pointer, view, session, glitchState, meltState } from "./state.js";
import { resizeCanvas, isInsideArtwork, resetArtwork } from "./display.js"
import { mixPaint, swirlPaint } from "./effects/smear.js";
import { applyGlitchBurst, processGlitchQueue, pushGlitchTrail } from "./effects/glitch.js";
import { spawnTrailDrip, updateTrailDrips } from "./effects/melt.js";
import { setMode, handleSourceLoad, handleSourceError } from "./ui.js";
export function animateVortex(time) {
  processGlitchQueue();
  // 滑動水流：每幀推進（放開後也繼續流到各自的隨機長度為止）
  updateTrailDrips();
  if (pointer.down && session.activeMode === "melt" && !session.hasInteracted) {
    session.hasInteracted = true;
    hint.classList.add("hidden");
  }
  if (pointer.down && pointer.longPressEligible && session.activeMode === "smear") {
    const heldFor = time - pointer.pressedAt;
    if (heldFor >= 500 && time - pointer.lastVortexFrame >= 70) {
      swirlPaint(pointer.pressX, pointer.pressY, heldFor);
      pointer.lastVortexFrame = time;

      if (!session.hasInteracted) {
        session.hasInteracted = true;
        hint.classList.add("hidden");
      }
    }
  }

  requestAnimationFrame(animateVortex);
}

function movePointer(event) {
  const currentX = event.clientX;
  const currentY = event.clientY;
  brushCursor.style.opacity = "1";
  brushCursor.style.left = `${currentX}px`;
  brushCursor.style.top = `${currentY}px`;

  if (!pointer.active) {
    pointer.previousX = currentX;
    pointer.previousY = currentY;
    pointer.active = true;
  }

  const deltaX = currentX - pointer.previousX;
  const deltaY = currentY - pointer.previousY;
  const distance = Math.hypot(deltaX, deltaY);

  if (pointer.down && Math.hypot(currentX - pointer.pressX, currentY - pointer.pressY) > 14) {
    pointer.longPressEligible = false;
  }

  if (session.activeMode === "glitch" || session.activeMode === "melt") {
    // Glitch 只在點擊時觸發；Melt 長按流動——移動時沿路徑隨機留下小水流
    if (session.activeMode === "melt" && pointer.down && distance > 0) {
      // 沿移動路徑撒水流：純機率隨機生成，但加上「最長空窗」保底——
      // 路徑上超過一定距離沒有水流時，強制補一條，避免長路徑出現大段空白
      const steps = Math.max(1, Math.ceil(distance / 24));
      for (let step = 1; step <= steps; step++) {
        const px = pointer.previousX + deltaX * (step / steps);
        const py = pointer.previousY + deltaY * (step / steps);
        if (!isInsideArtwork(px, py)) { meltState.gapSinceDrip = 0; continue; }
        meltState.gapSinceDrip = (meltState.gapSinceDrip || 0) + 24;
        if (Math.random() < 0.03 || meltState.gapSinceDrip >= 200) {
          spawnTrailDrip(px, py);
          meltState.gapSinceDrip = 0;
        }
      }
    }
    pointer.x = currentX;
    pointer.y = currentY;
    pointer.previousX = currentX;
    pointer.previousY = currentY;
    return;
  }

  if (distance > 0 && session.activeMode === "rgbsplit") {
    // 滑鼠移動速度（px/ms）平滑後決定效果強度
    const now = event.timeStamp || performance.now();
    const elapsed = glitchState.lastMoveAt ? Math.max(1, now - glitchState.lastMoveAt) : 16;
    glitchState.lastMoveAt = now;
    glitchState.energy = glitchState.energy * 0.7 + (distance / elapsed) * 0.3;

    const glitched = pushGlitchTrail(currentX, currentY, deltaX, deltaY);
    if (glitched && !session.hasInteracted) {
      session.hasInteracted = true;
      hint.classList.add("hidden");
    }

    pointer.x = currentX;
    pointer.y = currentY;
    pointer.previousX = currentX;
    pointer.previousY = currentY;
    return;
  }

  if (distance > 0) {
    const spacing = 10;
    const steps = Math.min(12, Math.max(1, Math.ceil(distance / spacing)));
    let mixedPaint = false;

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const x = pointer.previousX + deltaX * progress;
      const y = pointer.previousY + deltaY * progress;
      if (isInsideArtwork(x, y)) pointer.carryingPaint = true;
      if (pointer.carryingPaint) {
        mixPaint(x, y, deltaX, deltaY, distance);
        mixedPaint = true;
      }
    }

    if (mixedPaint && !session.hasInteracted) {
      session.hasInteracted = true;
      hint.classList.add("hidden");
    }
  }

  pointer.x = currentX;
  pointer.y = currentY;
  pointer.previousX = currentX;
  pointer.previousY = currentY;
}

canvas.addEventListener("pointermove", movePointer);
canvas.addEventListener("pointerleave", () => {
  pointer.active = false;
  pointer.carryingPaint = false;
  pointer.down = false;
  pointer.longPressEligible = false;
  glitchState.trail.hasPoint = false;
  brushCursor.style.opacity = "0";
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  movePointer(event);
  pointer.down = true;
  pointer.pressX = event.clientX;
  pointer.pressY = event.clientY;
  pointer.pressedAt = performance.now();
  // 重置移動基準點與水流撒落累計：否則新拖曳的第一個 move 會以上一次拖曳的
  // 舊位置算出巨大位移，讓水流沿著「幽靈路徑」出現在錯誤的固定區域
  pointer.previousX = event.clientX;
  pointer.previousY = event.clientY;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  meltState.gapSinceDrip = 0;
  pointer.longPressEligible = isInsideArtwork(event.clientX, event.clientY) || pointer.carryingPaint;
  pointer.lastVortexFrame = 0;
  // Glitch：每次點擊在點擊處產生一次隨機數位損壞
  if (session.activeMode === "glitch" && isInsideArtwork(event.clientX, event.clientY)) {
    applyGlitchBurst(event.clientX, event.clientY);
  }
});
canvas.addEventListener("pointerup", (event) => {
  pointer.down = false;
  pointer.longPressEligible = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener("pointercancel", () => {
  pointer.down = false;
  pointer.longPressEligible = false;
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
resetButton.addEventListener("click", resetArtwork);
window.addEventListener("resize", resizeCanvas);
sourceImage.addEventListener("load", handleSourceLoad);
sourceImage.addEventListener("error", handleSourceError);
sourceImage.src = "克羅姆-吻.jpg";
requestAnimationFrame(animateVortex);