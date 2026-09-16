// 應用程式進入點：動畫迴圈、指標事件與啟動流程。
import { canvas, context, hint, brushCursor, resetButton, sourceImage } from "./canvases.js";
import { pointer, view, session, glitchState, meltState } from "./state.js";
import { resizeCanvas, isInsideArtwork, resetArtwork } from "./display.js"
import { mixPaint, swirlPaint } from "./effects/smear.js";
import { applyGlitchBurst, processGlitchQueue, pushGlitchTrail } from "./effects/glitch.js";
import { meltPaint } from "./effects/melt.js";
import { setMode, handleSourceLoad, handleSourceError } from "./ui.js";
export function animateVortex(time) {
  processGlitchQueue();
  if (pointer.down && session.activeMode === "melt" && isInsideArtwork(pointer.x, pointer.y)) {
    if (time - meltState.lastFrame >= 40) {
      meltPaint(pointer.x, pointer.y);
      meltState.lastFrame = time;

      if (!session.hasInteracted) {
        session.hasInteracted = true;
        hint.classList.add("hidden");
      }
    }
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
    // Glitch 只在點擊時觸發；Melt 只在長按時流動——移動都不產生塗抹
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
  meltState.pressStart = pointer.pressedAt;
  meltState.drip.active = false;
  meltState.drip.tipY = 0;
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
  meltState.drip.active = false;
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