// Glitch / RGB Split（數位破壞）手法。
// RGB Split：沿掃動路徑排入取樣點，速度決定強度，
//   彩色 RGB displacement / Scanline / Pixel displacement / Datamosh
// Glitch：每次點擊在點擊處產生一次隨機數位損壞（切片錯位、拉伸、
//   複製拖影、水平垂直位移），保留原圖色彩，效果固定累積。
import { canvas, context, glitchCanvas, glitchContext, originalCanvas } from "../canvases.js";
import { view, session, glitchState } from "../state.js";
import { isInsideArtwork } from "../display.js";

// Glitch 點擊爆發：來源與輸出畫布（切片從乾淨來源讀取，避免互相覆蓋）
const glitchBurstSource = document.createElement("canvas");
const glitchBurstSourceContext = glitchBurstSource.getContext("2d", { willReadFrequently: true });
const glitchBurstOut = document.createElement("canvas");
const glitchBurstOutContext = glitchBurstOut.getContext("2d");
export function applyGlitchBurst(x, y) {
  if (!originalCanvas.width) return;
  // 每次點擊隨機強度：有時輕微、有時強烈
  const intensity = 0.3 + Math.random() * 0.7;
  const art = view.artworkRect;
  // 受損區域固定扁長形：寬度明顯大於高度，且整體範圍壓小
  const bandW = art.width * (0.24 + Math.random() * 0.28);
  const bandH = Math.max(14, art.height * (0.035 + Math.random() * 0.075));
  // 區域中心：點擊處加隨機偏移，可超出圖片邊緣（只夾限在視窗畫布內），
  // 讓切片錯位、碎片與噪點能蔓延到畫作框外
  const cx = Math.min(window.innerWidth - bandW / 2, Math.max(bandW / 2, x + (Math.random() - 0.5) * bandW * 0.5));
  const cy = Math.min(window.innerHeight - bandH / 2, Math.max(bandH / 2, y + (Math.random() - 0.5) * bandH * 0.5));

  const bw = Math.round(bandW * view.pixelRatio);
  const bh = Math.round(bandH * view.pixelRatio);
  if (bw < 10 || bh < 10) return;
  const bx = Math.round((cx - bandW / 2) * view.pixelRatio);
  const by = Math.round((cy - bandH / 2) * view.pixelRatio);

  // 擷取目前區域作為乾淨來源
  glitchBurstSource.width = bw;
  glitchBurstSource.height = bh;
  glitchBurstSourceContext.drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
  glitchBurstOut.width = bw;
  glitchBurstOut.height = bh;
  glitchBurstOutContext.clearRect(0, 0, bw, bh);
  glitchBurstOutContext.drawImage(glitchBurstSource, 0, 0);
  const g = glitchBurstOutContext;
  const s = glitchBurstSource;

  // 水平切片：錯位＋拉伸＋局部垂直位移＋拖影
  const sliceCount = 3 + Math.floor(Math.random() * 10 * intensity);
  const maxShift = bw * (0.03 + 0.16 * intensity);
  let sy = 0;
  while (sy < bh - 2) {
    const sliceH = Math.max(2, Math.round((bh / sliceCount) * (0.35 + Math.random() * 1.3)));
    const h = Math.min(sliceH, bh - sy);
    const dx = Math.round((Math.random() - 0.5) * 2 * maxShift);
    const stretch = 1 + (Math.random() - 0.35) * 0.55 * intensity;
    const dy = Math.random() < 0.25 ? Math.round((Math.random() - 0.5) * 2 * maxShift * 0.4) : 0;
    // 拖影：半透明複製一份再疊正式切片
    if (Math.random() < 0.35) {
      g.globalAlpha = 0.2 + Math.random() * 0.35;
      g.drawImage(s, 0, sy, bw, h, dx * 0.5 + (Math.random() - 0.5) * 10, sy + dy * 0.5, bw * stretch, h);
      g.globalAlpha = 1;
    }
    g.drawImage(s, 0, sy, bw, h, dx, sy + dy, bw * stretch, h);
    sy += h;
  }

  // 垂直切片：上下錯位（隨機出現）
  if (Math.random() < 0.5) {
    let sx = 0;
    const vMax = bh * (0.03 + 0.1 * intensity);
    while (sx < bw - 2) {
      const sliceW = Math.max(2, Math.round((bw / (sliceCount + 4)) * (0.4 + Math.random() * 1.4)));
      const w2 = Math.min(sliceW, bw - sx);
      const dy = Math.round((Math.random() - 0.5) * 2 * vMax);
      g.drawImage(s, sx, 0, w2, bh, sx, dy, w2, bh);
      sx += w2;
    }
  }

  // 強烈時：一條細長碎片大幅位移（細長影像碎片）
  if (intensity > 0.55 && Math.random() < 0.7) {
    const fy = Math.round(Math.random() * bh);
    const fh = Math.max(2, Math.round(bh * (0.02 + Math.random() * 0.06)));
    g.drawImage(
      s,
      0, fy, bw, fh,
      (Math.random() - 0.5) * bw * 0.5 * intensity,
      fy + (Math.random() - 0.5) * bh * 0.3,
      bw * (0.7 + Math.random() * 0.9),
      fh
    );
  }

  // 彩色噪點：在受損區域撒上細小的彩色雜訊
  // 密度隨強度並且每次隨機，上限壓低——只是點綴，不會蓋過畫作
  const noiseColor = () => {
    const pick = Math.random();
    if (pick < 0.18) return `rgb(255, ${Math.round(70 + Math.random() * 90)}, 70)`;
    if (pick < 0.36) return `rgb(70, 235, ${Math.round(110 + Math.random() * 60)})`;
    if (pick < 0.54) return `rgb(70, 140, 255)`;
    if (pick < 0.7) return `rgb(255, 225, 70)`;
    if (pick < 0.85) return `rgb(240, 70, 230)`;
    if (pick < 0.94) return `rgb(35, 38, 48)`;
    return `rgb(252, 252, 252)`;
  };
  const noiseDensity = (0.002 + 0.009 * intensity) * (0.5 + Math.random() * 0.9);
  const dotCount = Math.round((bw / view.pixelRatio) * (bh / view.pixelRatio) * noiseDensity);
  for (let n = 0; n < dotCount; n += 1) {
    const dotSize = (0.8 + Math.random() * 1.7) * view.pixelRatio;
    g.globalAlpha = 0.4 + Math.random() * 0.45;
    g.fillStyle = noiseColor();
    g.fillRect(Math.random() * bw, Math.random() * bh, dotSize, dotSize);
  }
  g.globalAlpha = 1;
  // 少量彩色橫向雜訊條（數量隨機，最多 3 條）
  const streaks = Math.round(Math.random() * 1.4 + intensity * 1.6);
  for (let st = 0; st < streaks; st += 1) {
    g.globalAlpha = 0.18 + Math.random() * 0.26;
    g.fillStyle = `hsl(${Math.floor(Math.random() * 360)}, 92%, 62%)`;
    g.fillRect(
      Math.random() * bw,
      Math.random() * bh,
      5 + Math.random() * 36 * intensity,
      1 + Math.random() * 2
    );
  }
  g.globalAlpha = 1;

  // 烘焙回主畫布（固定累積，下次點擊在此基礎上繼續破壞）
  context.drawImage(
    glitchBurstOut,
    bx / view.pixelRatio, by / view.pixelRatio, bw / view.pixelRatio, bh / view.pixelRatio
  );

  if (!session.hasInteracted) {
    session.hasInteracted = true;
    hint.classList.add("hidden");
  }
}

export function pushGlitchTrail(x, y, deltaX, deltaY) {
  const spacing = Math.max(12, Math.min(26, view.artworkRect.width * 0.035));
  let queued = false;

  if (!glitchState.trail.hasPoint) {
    glitchState.trail.lastX = x;
    glitchState.trail.lastY = y;
    glitchState.trail.hasPoint = true;
    if (isInsideArtwork(x, y)) {
      glitchState.queue.push({ x, y, dx: deltaX, dy: deltaY, energy: glitchState.energy });
      queued = true;
    }
  } else {
    let lastX = glitchState.trail.lastX;
    let lastY = glitchState.trail.lastY;
    let remaining = Math.hypot(x - lastX, y - lastY);

    while (remaining >= spacing) {
      const progress = spacing / remaining;
      lastX += (x - lastX) * progress;
      lastY += (y - lastY) * progress;
      remaining -= spacing;
      if (isInsideArtwork(lastX, lastY)) {
        glitchState.queue.push({ x: lastX, y: lastY, dx: deltaX, dy: deltaY, energy: glitchState.energy });
        queued = true;
      }
    }

    glitchState.trail.lastX = lastX;
    glitchState.trail.lastY = lastY;
  }

  if (glitchState.queue.length > 80) glitchState.queue.splice(0, glitchState.queue.length - 80);
  return queued;
}

export function processGlitchQueue() {
  let budget = 4;
  while (budget > 0 && glitchState.queue.length > 0) {
    const point = glitchState.queue.shift();
    applyGlitchRegion(point.x, point.y, point.dx, point.dy, point.energy, "rgbsplit");
    budget -= 1;
  }
}

export function applyGlitchRegion(x, y, deltaX, deltaY, energy, mode) {
  const isMono = mode === "glitch";
  const intensity = Math.min(1, 0.2 + energy * 0.3);
  const radius = Math.max(30, Math.min(58, view.artworkRect.width * 0.07)) * (0.9 + intensity * 0.3);
  const baseSpan = Math.round(radius * 2 * view.pixelRatio);
  if (baseSpan < 12) return;

  // Glitch：扁長區域——沿掃動方向拉長、垂直壓扁，比例隨機
  const stretch = 1.6 + Math.random() * 1.4;
  const squash = 0.35 + Math.random() * 0.35;
  const span = isMono ? Math.round(baseSpan * stretch) : baseSpan;
  const spanH = isMono ? Math.max(8, Math.round(baseSpan * squash)) : baseSpan;

  let x0 = Math.round(x * view.pixelRatio) - (span >> 1);
  let y0 = Math.round(y * view.pixelRatio) - (spanH >> 1);
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x0 + span > canvas.width) x0 = canvas.width - span;
  if (y0 + spanH > canvas.height) y0 = canvas.height - spanH;
  if (x0 < 0 || y0 < 0) return;

  glitchCanvas.width = span;
  glitchCanvas.height = spanH;
  glitchContext.drawImage(canvas, x0, y0, span, spanH, 0, 0, span, spanH);

  const frame = glitchContext.getImageData(0, 0, span, spanH);
  const pixels = frame.data;
  if (!glitchState.source || glitchState.source.length !== pixels.length) {
    glitchState.source = new Uint8ClampedArray(pixels.length);
  }
  glitchState.source.set(pixels);
  const source = glitchState.source;

  const length = Math.hypot(deltaX, deltaY) || 1;
  const dirX = deltaX / length;
  const dirY = deltaY / length;

  // 黑白 Glitch：先轉灰階，再以 Scanline + Pixel displacement 呈現
  if (isMono) {
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      pixels[i] = gray;
      pixels[i + 1] = gray;
      pixels[i + 2] = gray;
    }
  }

  // RGB displacement：紅藍通道沿掃動方向前後錯位（僅彩色模式）
  const magnitude = span * (0.02 + 0.075 * intensity);
  const redOffsetX = isMono ? 0 : dirX * magnitude;
  const redOffsetY = isMono ? 0 : dirY * magnitude;
  const blueOffsetX = isMono ? 0 : -dirX * magnitude;
  const blueOffsetY = isMono ? 0 : -dirY * magnitude;
  const greenOffsetX = isMono ? 0 : (Math.random() - 0.5) * magnitude * 0.5;
  const greenOffsetY = isMono ? 0 : (Math.random() - 0.5) * magnitude * 0.2;

  // Scanline：掃描線變暗，部分整列水平錯位
  // Glitch：每條掃描線的間距與粗細與粗細隨機，錯位帶高度也隨機
  const rowDark = new Uint8Array(spanH);
  const rowShift = new Float32Array(spanH);
  const scanDarken = isMono ? 1 - 0.62 * intensity : 1 - 0.42 * intensity;
  if (isMono) {
    let row = 0;
    while (row < spanH) {
      const gap = 2 + ((Math.random() * Math.max(2, spanH * 0.07)) | 0);
      const width = 1 + ((Math.random() * Math.max(1, gap * 0.7)) | 0);
      row += gap;
      for (let k = 0; k < width && row < spanH; k += 1, row += 1) rowDark[row] = 1;
    }
    let band = 0;
    while (band < spanH) {
      const bandHeight = 2 + ((Math.random() * Math.max(2, spanH * 0.1)) | 0);
      const shift = Math.random() < 0.4 + intensity * 0.4
        ? (Math.random() - 0.5) * 2 * span * 0.09 * intensity
        : 0;
      for (let k = 0; k < bandHeight && band < spanH; k += 1, band += 1) rowShift[band] = shift;
    }
    for (let row2 = 1; row2 < spanH - 1; row2 += 1) {
      rowShift[row2] = (rowShift[row2 - 1] + rowShift[row2] * 2 + rowShift[row2 + 1]) / 4;
    }
  } else {
    const scanGap = Math.max(3, Math.round(span / 26));
    const scanWidth = Math.max(1, Math.round(scanGap * 0.45));
    for (let row = 0; row < spanH; row += 1) {
      rowDark[row] = (row % scanGap) < scanWidth ? 1 : 0;
    }
    const bandHeight = scanGap * 2;
    const bandCount = Math.ceil(spanH / bandHeight) + 1;
    const bandShifts = new Float32Array(bandCount);
    for (let band = 0; band < bandCount; band += 1) {
      bandShifts[band] = Math.random() < 0.32 + intensity * 0.45
        ? (Math.random() - 0.5) * 2 * span * 0.055 * intensity
        : 0;
    }
    for (let band = 1; band < bandCount - 1; band += 1) {
      bandShifts[band] = (bandShifts[band - 1] + bandShifts[band] * 2 + bandShifts[band + 1]) / 4;
    }
    for (let row = 0; row < spanH; row += 1) rowShift[row] = bandShifts[(row / bandHeight) | 0];
  }

  // Pixel displacement：方塊位移場——Glitch 的方塊大小隨機不統一
  const blockSize = Math.max(4, Math.round(span / 14));
  const buildEdges = (total, randomize) => {
    const edges = [0];
    while (edges[edges.length - 1] < total) {
      const step = randomize
        ? Math.max(3, Math.round(total / 16 + Math.random() * (total / 9)))
        : blockSize;
      edges.push(Math.min(total, edges[edges.length - 1] + step));
    }
    return edges;
  };
  const colEdges = buildEdges(span, isMono);
  const rowEdges = buildEdges(spanH, isMono);
  const colCount = colEdges.length - 1;
  const rowCount = rowEdges.length - 1;
  const colOf = new Uint16Array(span);
  const rowOf = new Uint16Array(spanH);
  for (let c = 0; c < colCount; c += 1) {
    for (let px = colEdges[c]; px < colEdges[c + 1]; px += 1) colOf[px] = c;
  }
  for (let r = 0; r < rowCount; r += 1) {
    for (let py = rowEdges[r]; py < rowEdges[r + 1]; py += 1) rowOf[py] = r;
  }
  const blockShiftX = new Float32Array(colCount * rowCount);
  const blockShiftY = new Float32Array(colCount * rowCount);
  const blockMosh = new Uint8Array(colCount * rowCount);
  for (let block = 0; block < blockMosh.length; block += 1) {
    if (Math.random() < 0.1 + intensity * 0.3) {
      blockShiftX[block] = (Math.random() - 0.5) * 2 * span * (isMono ? 0.1 : 0.07) * intensity;
      blockShiftY[block] = (Math.random() - 0.5) * 2 * spanH * (isMono ? 0.05 : 0.035) * intensity;
    }
    if (!isMono && Math.random() < 0.06 + intensity * 0.2) blockMosh[block] = 1;
  }
  const quantizeStep = Math.max(14, Math.round(38 - intensity * 16));
  // 黑白模式：Bayer 4x4 有序抖動，讓灰階變成純黑白點陣
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const ditherStrength = isMono ? 0.55 + intensity * 0.45 : 0;

  for (let py = 0; py < spanH; py += 1) {
    const scanLine = rowDark[py] === 1;
    const bandShift = rowShift[py];
    const blockRow = rowOf[py] * colCount;
    const rowBase = py * span * 4;

    for (let px = 0; px < span; px += 1) {
      const block = blockRow + colOf[px];
      const baseX = px + bandShift + blockShiftX[block];
      const baseY = py + blockShiftY[block];

      let sampleX = Math.round(baseX + redOffsetX);
      let sampleY = Math.round(baseY + redOffsetY);
      if (sampleX < 0) sampleX = 0; else if (sampleX >= span) sampleX = span - 1;
      if (sampleY < 0) sampleY = 0; else if (sampleY >= spanH) sampleY = spanH - 1;
      let index = (sampleY * span + sampleX) * 4;
      let red = source[index];

      sampleX = Math.round(baseX + greenOffsetX);
      sampleY = Math.round(baseY + greenOffsetY);
      if (sampleX < 0) sampleX = 0; else if (sampleX >= span) sampleX = span - 1;
      if (sampleY < 0) sampleY = 0; else if (sampleY >= spanH) sampleY = spanH - 1;
      index = (sampleY * span + sampleX) * 4;
      let green = source[index + 1];

      sampleX = Math.round(baseX + blueOffsetX);
      sampleY = Math.round(baseY + blueOffsetY);
      if (sampleX < 0) sampleX = 0; else if (sampleX >= span) sampleX = span - 1;
      if (sampleY < 0) sampleY = 0; else if (sampleY >= spanH) sampleY = spanH - 1;
      index = (sampleY * span + sampleX) * 4;
      let blue = source[index + 2];

      if (scanLine) {
        red *= scanDarken;
        green *= scanDarken;
        blue *= scanDarken;
      }

      if (blockMosh[block]) {
        red = Math.round(red / quantizeStep) * quantizeStep + 6;
        green = Math.round(green / quantizeStep) * quantizeStep + 6;
        blue = Math.round(blue / quantizeStep) * quantizeStep + 6;
      }

      if (isMono) {
        // Bayer 抖動：灰階 → 純黑白點陣
        const threshold = (bayer[py & 3][px & 3] + 0.5) / 16 - 0.5;
        const dithered = red + threshold * 255 * ditherStrength;
        const bit = dithered > 127 ? 255 : 0;
        red = bit;
        green = bit;
        blue = bit;
      }

      const outIndex = rowBase + px * 4;
      pixels[outIndex] = red;
      pixels[outIndex + 1] = green;
      pixels[outIndex + 2] = blue;
    }
  }

  glitchContext.putImageData(frame, 0, 0);

  if (!isMono) {
    // Datamosh：殘影拖尾（沿掃動方向疊加位移）——僅彩色模式
    // 泛白修正：拖尾改用半透明疊加（不加光），僅保留微量加法光暈，
    // 高速時不再把亮部推向純白（原本 lighter 疊加最多 +0.56 白光）
    glitchContext.globalCompositeOperation = "source-over";
    glitchContext.globalAlpha = 0.14 + 0.12 * intensity;
    glitchContext.drawImage(glitchCanvas, dirX * magnitude * 0.9, dirY * magnitude * 0.9);
    glitchContext.globalAlpha = 0.08 + 0.08 * intensity;
    glitchContext.drawImage(glitchCanvas, dirX * magnitude * 1.8, dirY * magnitude * 1.8);
    glitchContext.globalCompositeOperation = "lighter";
    glitchContext.globalAlpha = 0.12 + 0.16 * intensity;
    glitchContext.drawImage(glitchCanvas, dirX * magnitude * 0.9, dirY * magnitude * 0.9);
    glitchContext.globalAlpha = 1;
    glitchContext.globalCompositeOperation = "source-over";

    // Datamosh：隨機區塊重複貼上，模擬 macroblock 錯置
    const echoes = 1 + Math.round(intensity * 3);
    for (let echo = 0; echo < echoes; echo += 1) {
      const echoWidth = blockSize * (1 + ((Math.random() * 2.5) | 0));
      const echoHeight = blockSize * (1 + ((Math.random() * 2.5) | 0));
      const echoX = Math.random() * Math.max(1, span - echoWidth);
      const echoY = Math.random() * Math.max(1, spanH - echoHeight);
      glitchContext.drawImage(
        glitchCanvas,
        echoX,
        echoY,
        echoWidth,
        echoHeight,
        echoX + (Math.random() - 0.5) * span * 0.18 * intensity,
        echoY + (Math.random() - 0.5) * span * 0.09 * intensity,
        echoWidth,
        echoHeight
      );
    }
  }

  // 以柔邊範圍烘焙回畫布，效果固定累積
  // 黑白模式用扁長橢圓遮罩，彩色模式用圓形柔邊
  const half = span / 2;
  glitchContext.globalCompositeOperation = "destination-in";
  if (isMono) {
    // 扁長橢圓遮罩：中央實心、邊緣柔化
    glitchContext.save();
    glitchContext.translate(half, spanH / 2);
    glitchContext.scale(1, spanH / span);
    const mask = glitchContext.createRadialGradient(0, 0, span * 0.26, 0, 0, span * 0.5);
    mask.addColorStop(0, "rgba(0, 0, 0, 1)");
    mask.addColorStop(0.72, "rgba(0, 0, 0, 1)");
    mask.addColorStop(1, "rgba(0, 0, 0, 0)");
    glitchContext.fillStyle = mask;
    glitchContext.fillRect(-half, -span / 2, span, span);
    glitchContext.restore();
  } else {
    const mask = glitchContext.createRadialGradient(half, half, half * 0.5, half, half, half);
    mask.addColorStop(0, "rgba(0, 0, 0, 1)");
    mask.addColorStop(1, "rgba(0, 0, 0, 0)");
    glitchContext.fillStyle = mask;
    glitchContext.fillRect(0, 0, span, span);
  }
  glitchContext.globalCompositeOperation = "source-over";

  context.drawImage(
    glitchCanvas,
    x0 / view.pixelRatio,
    y0 / view.pixelRatio,
    span / view.pixelRatio,
    spanH / view.pixelRatio
  );
}