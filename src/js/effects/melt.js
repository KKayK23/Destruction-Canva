// Melt（融化）手法：按住滑動時，沿著滑過的路徑隨機留下獨立的小水流。
// 每條水流的速度、流動長度、粗細、顏色都是隨機的——流到自己的長度上限就停住。
import { canvas, context, meltBufferCanvas, meltBufferContext } from "../canvases.js";
import { view, meltState } from "../state.js";

// 滑動滴落：按住滑動時，沿著滑過的路徑隨機留下獨立的小水流。
export function spawnTrailDrip(x, y) {
  const radius = Math.max(30, Math.min(48, view.artworkRect.width * 0.065));
  // 從當前畫面取該點附近的主色，讓水流顏色跟著畫面走
  const sw = Math.round(radius * 0.5 * view.pixelRatio);
  const sx = Math.round((x - sw / 2) * view.pixelRatio);
  const sy = Math.round((y - sw / 2) * view.pixelRatio);
  let r = 0, g = 0, b = 0, count = 0;
  try {
    const data = context.getImageData(sx, sy, sw, sw).data;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1;
    }
  } catch { return; }
  if (count === 0) return;
  r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);

  meltState.trailDrips.push({
    // 小幅隨機偏移：水流貼著路徑，只稍微散開
    x: x + (Math.random() * 2 - 1) * radius * 0.25,
    y: y + (Math.random() * 2 - 1) * radius * 0.15,
    // 每條水流：隨機速度（0.15～0.9 px/幀，流速放慢更從容）、隨機流動長度（40～260px）、隨機粗細
    speed: 0.15 + Math.random() * 0.75,
    maxTravel: 40 + Math.random() * 220,
    travel: 0,
    width: radius * (0.1 + Math.random() * 0.22),
    seed: Math.random() * 100,
    noise: Array.from({ length: 32 }, () => Math.random() * 2 - 1),
    color: `rgb(${r}, ${g}, ${b})`,
    rgb: [r, g, b]
  });
  // 上限保護：太多水流時移除最舊的（水流越多每幀合成越貴，上限壓低保住帧率）
  if (meltState.trailDrips.length > 22) meltState.trailDrips.shift();
}

// 滑動滴落：按住滑動時，沿著滑過的路徑隨機留下獨立的小水流。
// 每條水流的速度、流動長度、粗細、顏色都是隨機的——流到自己的長度上限就停住。
// 繪製一條水流到指定 context（不做 blur——blur 由 updateTrailDrips 統一一次合成）
function drawDripStream(ctx, d) {
  const tipY = d.y + d.travel;
  const seed = d.seed;
  const noiseAt = (i) => {
    const n = d.noise;
    const idx = Math.floor(i) % n.length;
    const frac = i - Math.floor(i);
    const a = n[idx];
    const b = n[(idx + 1) % n.length];
    const s = frac * frac * (3 - 2 * frac);
    return a + (b - a) * s;
  };
  const halfWidthAt = (h) => {
    const t = h * 0.05 + seed;
    const noise = noiseAt(h / 40) * 0.45;
    const w1 = Math.sin(t * 0.9) * 0.2;
    // 起點細、中段略寬、末端收細成水滴
    const grow = h < 30 ? 0.35 + 0.65 * (h / 30) : 1;
    const taper = d.maxTravel === Infinity ? 1 : Math.max(0.25, 1 - h / (d.maxTravel * 1.4));
    return Math.max(1, d.width * taper * grow * (1 + noise + w1) / 2);
  };

  const steps = Math.max(6, Math.round(d.travel / 5));
  const [cr, cg, cb] = d.rgb;
  // 底層暈染（寬而淡，柔邊感由整體一次 blur 合成時產生）
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const h = d.travel * i / steps;
    const hw = halfWidthAt(h) * 1.6;
    if (i === 0) ctx.moveTo(d.x - hw, d.y + h);
    else ctx.lineTo(d.x - hw, d.y + h);
  }
  for (let i = steps; i >= 0; i--) {
    ctx.lineTo(d.x + halfWidthAt(d.travel * i / steps) * 1.6, d.y + d.travel * i / steps);
  }
  ctx.closePath();
  ctx.fill();
  // 主體
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const h = d.travel * i / steps;
    const hw = halfWidthAt(h);
    if (i === 0) ctx.moveTo(d.x - hw, d.y + h);
    else ctx.lineTo(d.x - hw, d.y + h);
  }
  // 末端圓潤水滴頭
  const hwEnd = halfWidthAt(d.travel);
  ctx.quadraticCurveTo(d.x - hwEnd, tipY + hwEnd * 0.9, d.x, tipY + hwEnd * 1.2);
  ctx.quadraticCurveTo(d.x + hwEnd, tipY + hwEnd * 0.9, d.x + hwEnd, tipY);
  for (let i = steps; i >= 0; i--) {
    ctx.lineTo(d.x + halfWidthAt(d.travel * i / steps), d.y + d.travel * i / steps);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // 末端倒泪滴水滴：底部圓、頂部尖（尖端接在水流末端），大小隨水流粗細
  const dropW = Math.max(hwEnd * 2.6, 9);
  const dropH = Math.max(hwEnd * 3.4, 7);
  const dropTop = tipY - dropH * 0.15;
  const dropY = dropTop + dropH * 0.62;
  const tearPath = () => {
    ctx.beginPath();
    ctx.moveTo(d.x, dropTop);
    ctx.bezierCurveTo(
      d.x + dropW * 0.18, dropTop + dropH * 0.3,
      d.x + dropW * 0.5, dropTop + dropH * 0.42,
      d.x + dropW * 0.5, dropY
    );
    ctx.arc(d.x, dropY, dropW * 0.5, 0, Math.PI, false);
    ctx.bezierCurveTo(
      d.x - dropW * 0.5, dropTop + dropH * 0.42,
      d.x - dropW * 0.18, dropTop + dropH * 0.3,
      d.x, dropTop
    );
    ctx.closePath();
  };
  // 水滴本體：徑向漸層立體感（左上高光、邊緣飽和深色）
  const dropGrad = ctx.createRadialGradient(
    d.x - dropW * 0.15, dropY + dropH * 0.05, dropW * 0.08,
    d.x, dropY + dropH * 0.05, dropW * 0.6
  );
  dropGrad.addColorStop(0, `rgba(${Math.min(255, cr + 55)}, ${Math.min(255, cg + 55)}, ${Math.min(255, cb + 55)}, 1)`);
  dropGrad.addColorStop(0.55, d.color);
  dropGrad.addColorStop(1, `rgba(${Math.round(cr * 0.5)}, ${Math.round(cg * 0.5)}, ${Math.round(cb * 0.5)}, 1)`);
  ctx.fillStyle = dropGrad;
  tearPath();
  ctx.fill();
  // 水滴外圈深色描邊：顏料在滴緣堆積變深，強化立體感
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1.5, dropW * 0.1);
  ctx.strokeStyle = `rgba(${Math.round(cr * 0.5)}, ${Math.round(cg * 0.5)}, ${Math.round(cb * 0.5)}, 1)`;
  tearPath();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// 每幀推進並繪製所有滑動水流；回傳 true 表示還有活著的水流
// 效能關鍵：所有水流先畫進離屏緩衝（無 filter），最後對整個緩衝做「一次」blur 合成——
// 逐個形狀套 context.filter 在大畫布上每次合成約 10ms，60 條水流會卡到 1 秒/帧
export function updateTrailDrips() {
  const drips = meltState.trailDrips;
  if (drips.length === 0) return false;
  const bottomLimit = window.innerHeight - 4;

  // 緩衝尺寸對齊主畫布（裝置像素），並套用與主畫布相同的 pixelRatio 縮放——
  // 水流座標是 CSS 像素，若不縮放，合成後整體會向左上偏移（座標系錯位 bug）
  if (meltBufferCanvas.width !== canvas.width || meltBufferCanvas.height !== canvas.height) {
    meltBufferCanvas.width = canvas.width;
    meltBufferCanvas.height = canvas.height;
  }
  meltBufferContext.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);
  meltBufferContext.clearRect(0, 0, meltBufferCanvas.width, meltBufferCanvas.height);

  for (const d of drips) {
    if (d.travel >= d.maxTravel || d.y + d.travel >= bottomLimit) continue;
    // 每條水流速度再加一點隨機抖動，流動更自然
    const step = d.speed * (0.7 + Math.random() * 0.6);
    d.travel = Math.min(d.maxTravel, d.travel + step);
    if (d.y + d.travel > bottomLimit) d.travel = bottomLimit - d.y;

    drawDripStream(meltBufferContext, d);
  }

  // 一次性 blur 合成：柔邊暈染 + 清晰主體兩次 drawImage（只有兩次全畫布合成，成本固定）
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 0.55;
  context.filter = "blur(4px)";
  context.drawImage(meltBufferCanvas, 0, 0);
  context.filter = "none";
  context.globalAlpha = 0.85;
  context.drawImage(meltBufferCanvas, 0, 0);
  context.globalAlpha = 1;
  context.restore();

  // 移除已流完且畫面已定格的水流（保留一點時間讓最後一幀畫完）
  for (let i = drips.length - 1; i >= 0; i--) {
    if (drips[i].travel >= drips[i].maxTravel && drips[i].settled === undefined) {
      drips[i].settled = performance.now();
    }
    if (drips[i].settled !== undefined && performance.now() - drips[i].settled > 120) {
      drips.splice(i, 1);
    }
  }
  return true;
}