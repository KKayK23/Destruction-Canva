// 介面互動：提示訊息、匯出、上傳（按鈕 / 拖放 / 貼上）、手法切換。
import { canvas, context, hint, exportButton, exportMenu, uploadButton, uploadInput, dropOverlay, toast, sourceImage, modeButtons, brushCursor, defaultArtButton } from "./canvases.js";
import { view, session, glitchState, MODE_HINTS } from "./state.js";
import { resizeCanvas, computeSourceRect } from "./display.js";

export function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(session.toastTimer);
  session.toastTimer = setTimeout(() => toast.classList.remove("visible"), 1900);
}

export function setMode(mode) {
  if (session.activeMode === mode) return;
  session.activeMode = mode;
  Object.entries(modeButtons).forEach(([name, button]) => {
    button.classList.toggle("active", mode === name);
    button.setAttribute("aria-pressed", String(mode === name));
  });
  brushCursor.classList.toggle("glitch", mode === "glitch" || mode === "rgbsplit");
  brushCursor.classList.toggle("drip", mode === "melt");
  brushCursor.classList.toggle("tear", mode === "tear");
  glitchState.trail.hasPoint = false;

  // 引導文字：每次切換手法都重新顯示，先淡出 → 換文字 → 再淡入，停留後自動淡出
  const showModeHint = () => {
    hint.textContent = MODE_HINTS[mode];
    hint.classList.remove("hidden");
    if (session.hintAutoFadeTimer) clearTimeout(session.hintAutoFadeTimer);
    session.hintAutoFadeTimer = setTimeout(() => hint.classList.add("hidden"), 2600);
  };
  if (hint.classList.contains("hidden")) {
    showModeHint();
  } else {
    hint.classList.add("hidden");
    if (session.hintFadeTimer) clearTimeout(session.hintFadeTimer);
    session.hintFadeTimer = setTimeout(showModeHint, 700);
  }
}
export function setExportMenu(open) {
  exportMenu.classList.toggle("open", open);
  exportButton.setAttribute("aria-expanded", String(open));
}

export function exportArtwork(format) {
  setExportMenu(false);
  canvas.toBlob((blob) => {
    if (!blob) {
      showToast("匯出失敗，請再試一次");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `破壞藝術-Destruction-Canva-${stamp}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(`已匯出 ${format.toUpperCase()}`);
  }, format === "jpg" ? "image/jpeg" : "image/png", format === "jpg" ? 0.92 : undefined);
}

exportButton.addEventListener("click", () => {
  setExportMenu(!exportMenu.classList.contains("open"));
});

exportMenu.addEventListener("click", (event) => {
  const item = event.target.closest("button[data-format]");
  if (item) exportArtwork(item.dataset.format);
});

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("#export, #exportMenu")) setExportMenu(false);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setExportMenu(false);
});

let currentObjectUrl = null;
let pendingObjectUrl = null;

// 估計上傳圖片的內容範圍，自動裁除四周均勻的白邊或透明邊。
export function handleSourceLoad() {
  if (pendingObjectUrl) {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = pendingObjectUrl;
    pendingObjectUrl = null;
    view.sourceRect = computeSourceRect(sourceImage);
    showToast("已載入圖片");
  } else {
    // 默認畫作載入：上傳圖可能改寫過 sourceRect（自動裁切範圍），
    // 必須還原默認圖的裁切常數，否則默認畫作會以上傳圖的比例顯示而變形/變小。
    view.sourceRect = { x: 170, y: 82, width: 682, height: 840 };
  }
  resizeCanvas();
}

export function handleSourceError() {
  if (pendingObjectUrl) {
    URL.revokeObjectURL(pendingObjectUrl);
    pendingObjectUrl = null;
    showToast("圖片載入失敗，請換一張試試");
  } else {
    hint.textContent = "畫作載入失敗";
  }
}

export function loadUserImage(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("請選擇圖片檔案");
    return;
  }
  pendingObjectUrl = URL.createObjectURL(file);
  sourceImage.src = pendingObjectUrl;
}

uploadButton.addEventListener("click", () => uploadInput.click());

// 默認畫作：點擊切回預設圖片「克羅姆-吻」（上傳或貼上其他圖後可按這裡換回來）。
defaultArtButton.addEventListener("click", () => {
  if (sourceImage.src.endsWith(encodeURI("克羅姆-吻.jpg")) && !sourceImage.src.startsWith("blob:")) {
    showToast("目前已是默認畫作");
    return;
  }
  if (pendingObjectUrl) {
    URL.revokeObjectURL(pendingObjectUrl);
    pendingObjectUrl = null;
  }
  sourceImage.src = "克羅姆-吻.jpg";
});

uploadInput.addEventListener("change", () => {
  loadUserImage(uploadInput.files && uploadInput.files[0]);
  uploadInput.value = "";
});

let dragDepth = 0;

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.classList.add("visible");
});

window.addEventListener("dragover", (event) => event.preventDefault());

window.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.remove("visible");
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove("visible");
  loadUserImage(event.dataTransfer && event.dataTransfer.files[0]);
});

window.addEventListener("paste", (event) => {
  const items = event.clipboardData && event.clipboardData.items;
  const item = items && Array.from(items).find((entry) => entry.type.startsWith("image/"));
  if (item) loadUserImage(item.getAsFile());
});
modeButtons.sticker.addEventListener("click", () => setMode("sticker"));
modeButtons.tear.addEventListener("click", () => setMode("tear"));