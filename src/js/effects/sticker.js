// Smiley Face 手法：點擊畫面在點擊處貼上一張隨機 smiley face 貼紙
// （白邊 + 底部陰影，模擬真實貼紙被貼上的效果）。
// 圖片來源：破壞藝術png/smiley face/ 資料夾。
import { view } from "../state.js";
import { isInsideArtwork } from "../display.js";

const STICKER_SOURCES = [
  "破壞藝術png/smiley face/3d metal smiley.png",
  "破壞藝術png/smiley face/alien smiley.png",
  "破壞藝術png/smiley face/ball smiley.png",
  "破壞藝術png/smiley face/blue smiley.png",
  "破壞藝術png/smiley face/card smiley.png",
  "破壞藝術png/smiley face/coin smiley.png",
  "破壞藝術png/smiley face/crayon smiley.png",
  "破壞藝術png/smiley face/daisy smiley.png",
  "破壞藝術png/smiley face/fire smiley-4x-Photoroom.png",
  "破壞藝術png/smiley face/flat smiley.png",
  "破壞藝術png/smiley face/melt smiley.png",
  "破壞藝術png/smiley face/pattern smiley.png",
  "破壞藝術png/smiley face/pixel smiley.png",
  "破壞藝術png/smiley face/sign smiley.png",
  "破壞藝術png/smiley face/spray smiley.png",
  "破壞藝術png/smiley face/sticker smiley.png",
  "破壞藝術png/smiley face/sun smiley.png",
  "破壞藝術png/smiley face/three smiley.png"
];

const stickers = [];
let pendingLoads = STICKER_SOURCES.length;

function preloadStickers() {
  STICKER_SOURCES.forEach((src) => {
    const image = new Image();
    image.onload = () => {
      stickers.push(image);
      pendingLoads -= 1;
    };
    image.onerror = () => { pendingLoads -= 1; };
    image.src = encodeURI(src);
  });
}
preloadStickers();

// 預先把原圖加上白邊，烘焙成貼紙 sprite。
// 白邊貼合圖案的 alpha 輪廓（不是圖片矩形邊框）：
// 1) 把白圖以 destination-in 限制在「不透明度門檻以上的像素」內，形成形狀剪影；
// 2) 把剪影沿 16 個方向向外堆疊多次形成白邊；
// 3) 疊回原圖完成貼紙。
// 門檻處理：Photoroom 去背的 PNG 在形狀外圍會殘留低 alpha 的白色光暈像素，
// 若直接用 alpha > 0 當輪廓，白邊外會浮出淡淡的方形邊界；用 0.5 門檻可乾淨切除。
// 作法是先把 alpha 二值化（低於門檻 → 0，以上 → 1）畫成剪影遮罩，再套用到白圖上。
function bakeStickerSprite(image) {
  const outline = Math.max(6, Math.round(image.width * 0.045));
  const pad = outline * 2;
  const sprite = document.createElement("canvas");
  sprite.width = image.width + pad * 2;
  sprite.height = image.height + pad * 2;
  const ctx = sprite.getContext("2d");

  // 先產生二值化剪影（alpha >= 0.5 的區域）
  const mask = document.createElement("canvas");
  mask.width = image.width;
  mask.height = image.height;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  maskContext.drawImage(image, 0, 0);
  const pixels = maskContext.getImageData(0, 0, mask.width, mask.height);
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = data[index + 1] = data[index + 2] = 255;
    data[index + 3] = data[index + 3] >= 128 ? 255 : 0;
  }
  maskContext.putImageData(pixels, 0, 0);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sprite.width, sprite.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, pad, pad);
  ctx.restore();

  // 白邊（非破壞性描邊）：把「白色剪影」重複畫到一個獨立的 silhouette 圖層上，
  // 再把 silhouette 疊回 sprite。不能用 sprite 自我重疊——那會把剪影不斷往外
  // 擴散（上一輪的描邊結果變成下一輪的來源），最終填滿整個畫布變成白方塊。
  const silhouette = document.createElement("canvas");
  silhouette.width = sprite.width;
  silhouette.height = sprite.height;
  const silhouetteContext = silhouette.getContext("2d");
  silhouetteContext.drawImage(sprite, 0, 0);

  for (let angle = 0; angle < 16; angle += 1) {
    const radians = (angle / 16) * Math.PI * 2;
    for (const distance of [outline * 0.25, outline * 0.5, outline * 0.75, outline]) {
      silhouetteContext.drawImage(
        sprite,
        Math.cos(radians) * distance,
        Math.sin(radians) * distance
      );
    }
  }
  // 把「剪影 + 白邊」疊回 sprite 完成貼紙
  ctx.drawImage(silhouette, 0, 0);
  // 疊回原圖，圖案蓋在白邊之上
  ctx.drawImage(image, pad, pad);

  // 貼紙表面亮面：斜向白色光帶（高光 → 淡反光），
  // 用 source-atop 只疊在貼紙已有的像素上（含白邊），模擬塑膠貼紙的反光質感。
  ctx.globalCompositeOperation = "source-atop";
  const gloss = ctx.createLinearGradient(0, 0, sprite.width * 0.9, sprite.height * 0.9);
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.42)");
  gloss.addColorStop(0.3, "rgba(255, 255, 255, 0.06)");
  gloss.addColorStop(0.5, "rgba(255, 255, 255, 0.16)");
  gloss.addColorStop(0.75, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, sprite.width, sprite.height);
  ctx.globalCompositeOperation = "source-over";
  return sprite;
}

const spriteCache = new Map();
function getStickerSprite(image) {
  if (!spriteCache.has(image.src)) spriteCache.set(image.src, bakeStickerSprite(image));
  return spriteCache.get(image.src);
}

// 隨機挑圖：加權抽選——每張圖出現過就越來越難再被選中，
// 避免同一張洗版，同時保留隨機感（不是死板的輪流）；另保證不與上一張相同。
// 注意：圖片是非同步載入，不能用載入時的 stickers 長度初始化計數表，
// 改用 Map（查不到視為 0）才不會算出 NaN 導致永遠選中同一張。
const stickerCounts = new Map();
let lastStickerIndex = -1;
function pickStickerIndex() {
  const weights = stickers.map((_, index) =>
    index === lastStickerIndex ? 0 : 1 / (1 + (stickerCounts.get(index) || 0))
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return index;
  }
  return weights.length - 1;
}

// 在點擊處貼上一張隨機貼紙：隨機挑圖、隨機大小與旋轉，
// 白邊貼紙 + 往下的柔和陰影，模擬貼紙浮在畫作表面。
export function placeSticker(x, y) {
  if (!stickers.length || !isInsideArtwork(x, y)) return;
  const stickerIndex = pickStickerIndex();
  stickerCounts.set(stickerIndex, (stickerCounts.get(stickerIndex) || 0) + 1);
  lastStickerIndex = stickerIndex;
  const image = stickers[stickerIndex];
  const sprite = getStickerSprite(image);

  // 貼紙顯示大小：以 sprite 長邊為準落在畫作高度的 15%–19%（隨機），
  // 用長邊而非高來算，寬扁或瘦高的圖案才不會放大過頭。
  const spriteMaxSide = Math.max(sprite.width, sprite.height);
  const targetSize = view.artworkRect.height * (0.15 + Math.random() * 0.04);
  const scale = targetSize / spriteMaxSide;
  const width = sprite.width * scale;
  const height = sprite.height * scale;
  const rotation = (Math.random() - 0.5) * (Math.PI / 3); // ±30°

  const context = canvasContext();
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.shadowColor = "rgba(0, 0, 0, 0.4)";
  context.shadowBlur = scale * 30;
  context.shadowOffsetY = scale * 45; // 陰影偏下 → 貼紙浮起感
  context.drawImage(sprite, -width / 2, -height / 2, width, height);
  context.restore();
}

import { canvas } from "../canvases.js";
function canvasContext() {
  return canvas.getContext("2d", { alpha: false });
}
