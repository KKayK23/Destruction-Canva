// Melt（融化）手法：長按時顏料像水流一樣從按壓點向下流動、流出圓圈，放開即停止。
// 做法：按壓時從當前畫布快取一條完整的顏料柱（按壓點到底部），
// 每幀把快取柱的 [0..travel] 段 1:1 畫出來——顏色連續、無條紋，像水一樣流出圓圈。
import { canvas, context } from "../canvases.js";
import { view, meltState, meltContext, meltSourceContext } from "../state.js";
// Melt 手法：長按時顏料像水流一樣從按壓點向下流動、流出圓圈，放開即停止
// 做法：按壓時從 originalCanvas 快取一條完整的顏料柱（按壓點到畫作底部），
// 每幀把快取柱的 [0..travel] 段 1:1 畫出來——顏色連續、無條紋，像水一樣流出圓圈
export function meltPaint(x, y) {
  const radius = Math.max(30, Math.min(48, view.artworkRect.width * 0.065));
  const stripWidth = radius * 1.15;

  // 按壓開始時初始化水滴尖端，並快取完整的原始顏料柱
  if (!meltState.drip.active) {
    meltState.drip.active = true;
    meltState.drip.tipY = y + radius * 0.4;
    meltState.drip.x = x;
    meltState.drip.y = y;
    meltState.drip.travel = 0;
    const cacheX = Math.round((x - stripWidth / 2) * view.pixelRatio);
    const cacheW = Math.round(stripWidth * view.pixelRatio);
    const cacheY = Math.round(y * view.pixelRatio);
    const cacheH = Math.round((window.innerHeight - y) * view.pixelRatio);
    meltState.source.width = cacheW;
    meltState.source.height = cacheH;
    meltSourceContext.setTransform(1, 0, 0, 1, 0, 0);
    meltSourceContext.clearRect(0, 0, cacheW, cacheH);
    // 從當前畫面取色：如果畫作上已有其他手法的痕跡，也會一併被融化流下來
    meltSourceContext.drawImage(canvas, cacheX, cacheY, cacheW, cacheH, 0, 0, cacheW, cacheH);
    // 計算按壓點的主色，之後用來做水流的飽和底色（原圖同位置顏色會讓水流隱形，需要加深）
    const swatch = meltSourceContext.getImageData(0, 0, cacheW, Math.min(cacheH, Math.round(radius * 0.8 * view.pixelRatio))).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < swatch.length; i += 4) {
      r += swatch[i]; g += swatch[i + 1]; b += swatch[i + 2]; count += 1;
    }
    meltState.drip.color = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
    meltState.drip.rgb = [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
    meltState.drip.seed = Math.random() * 100;
  }

  // 加速度：按越久流越快；尖端可以流出畫作圖片外面（用整個視窗底部做上限）
  // 流速：慢起（剛開始細流可見），按越久漸漸加快但上限壓低
  const speed = 0.55 + Math.min(1.9, (performance.now() - meltState.pressStart) / 1400);
  const bottomLimit = window.innerHeight - 4;
  const tipY = Math.min(meltState.drip.tipY + speed, bottomLimit);
  const segmentHeight = tipY - meltState.drip.tipY;
  meltState.drip.tipY = tipY;
  meltState.drip.travel += segmentHeight;

  if (segmentHeight <= 0) return;

  // 水流：從按壓點下方開始自然流下。邊緣用正弦波形做出有機的粗細變化，
  // 像真實液體沿著表面流動時忽寬忽窄、局部積聚的樣子
  const streamTop = meltState.drip.y + radius * 0.4;
  const streamHeight = meltState.drip.travel;
  const baseWidth = stripWidth * 0.36;
  const [cr, cg, cb] = meltState.drip.rgb;
  const seed = meltState.drip.seed || 0;

  // 建立波形輪廓：回傳在高度 h 處的半寬
  // 預先產生一組隨機節點，用平滑雜訊插值——每段按壓的起伏都不同，弧度隨機
  if (!meltState.drip.noise) {
    meltState.drip.noise = Array.from({ length: 64 }, () => Math.random() * 2 - 1);
  }
  const noiseAt = (i) => {
    const n = meltState.drip.noise;
    const idx = Math.floor(i) % n.length;
    const frac = i - Math.floor(i);
    const a = n[idx];
    const b = n[(idx + 1) % n.length];
    // smoothstep 插值讓弧度圓滑
    const s = frac * frac * (3 - 2 * frac);
    return a + (b - a) * s;
  };
  const halfWidthAt = (h) => {
    // 隨機雜訊（主導）+ 兩層正弦（細微紋理），每段按壓的波形都不同
    const t = h * 0.045 + seed;
    const noise = noiseAt(h / 46) * 0.5;
    const w1 = Math.sin(t * 0.8) * 0.18;
    const w2 = Math.sin(t * 2.1 + 1.7) * 0.1;
    // 逐漸變細：起點細（0.4 倍），先漸變寬（顏料湧出積聚）到 1.35 倍，再持續收窄到 0.18 倍
    const grow = h < radius * 3 ? 0.4 + 0.95 * (h / (radius * 3)) : Math.min(1.35, 1 + (h - radius * 3) / (radius * 2) * 0.35);
    const taper = Math.max(0.18, 1 - h / (radius * 12));
    return Math.max(1.2, baseWidth * taper * grow * (1 + noise + w1 + w2) / 2);
  };

  // 用波形輪廓建構封閉路徑（左邊下去、右邊上來）
  // 頂端從寬到窄漸入（neckIn），像從按壓點「湧出」而非方形切斷
  const neckLen = radius * 0.55;
  const wavePath = (widthScale, alpha, blurPx) => {
    const steps = Math.max(8, Math.round(streamHeight / 6));
    context.globalAlpha = alpha;
    if (blurPx > 0) context.filter = `blur(${blurPx}px)`;
    context.beginPath();
    // 左側：從頂端往下
    for (let i = 0; i <= steps; i++) {
      const h = streamHeight * i / steps;
      let hw = halfWidthAt(h) * widthScale;
      // 頂部漸細：前 neckLen 內從 0.25 倍寬漸入到全寬
      if (h < neckLen) hw *= 0.25 + 0.75 * (h / neckLen);
      const y = streamTop + h;
      if (i === 0) context.moveTo(meltState.drip.x - hw, y);
      else context.lineTo(meltState.drip.x - hw, y);
    }
    // 底端圓弧收尾（水滴狀圓潤底）
    const hwEnd = halfWidthAt(streamHeight) * widthScale;
    context.quadraticCurveTo(meltState.drip.x - hwEnd, streamTop + streamHeight + hwEnd * 0.9, meltState.drip.x, streamTop + streamHeight + hwEnd * 1.1);
    context.quadraticCurveTo(meltState.drip.x + hwEnd, streamTop + streamHeight + hwEnd * 0.9, meltState.drip.x + hwEnd, streamTop + streamHeight);
    // 右側：從底端往上
    for (let i = steps; i >= 0; i--) {
      const h = streamHeight * i / steps;
      let hw = halfWidthAt(h) * widthScale;
      if (h < neckLen) hw *= 0.25 + 0.75 * (h / neckLen);
      context.lineTo(meltState.drip.x + hw, streamTop + h);
    }
    // 頂端以圓弧閉合（窄口，不會有方形起點）
    const hwStart = halfWidthAt(0) * widthScale * 0.25;
    context.quadraticCurveTo(meltState.drip.x + hwStart, streamTop + 2, meltState.drip.x, streamTop);
    context.quadraticCurveTo(meltState.drip.x - hwStart, streamTop + 2, meltState.drip.x - halfWidthAt(0) * widthScale * 0.25, streamTop);
    context.closePath();
    context.fillStyle = meltState.drip.color;
    context.fill();
    context.globalAlpha = 1;
    context.filter = "none";
  };

  context.save();

  // 底層暈染：寬而模糊，像顏料浸濕紙面擴散
  wavePath(1.5, 0.22, 7);
  // 主體：濃稠顏料柱
  wavePath(1.0, 0.92, 0.8);
  // 中央加深：模擬顏料堆積的厚度
  wavePath(0.45, 0.3, 2);

  // 高光：左側細細一條亮紋，做出液體的反光與體積感
  context.globalAlpha = 0.3;
  context.filter = "blur(1.5px)";
  context.fillStyle = `rgba(255, 255, 255, 0.55)`;
  context.beginPath();
  const hlSteps = Math.max(6, Math.round(streamHeight / 10));
  for (let i = 0; i <= hlSteps; i++) {
    const h = streamHeight * 0.06 + streamHeight * 0.8 * i / hlSteps;
    const hw = halfWidthAt(h);
    const y = streamTop + h;
    const xOff = -hw * 0.45 + Math.sin(h * 0.02 + seed) * 1.5;
    if (i === 0) context.moveTo(meltState.drip.x + xOff, y);
    else context.lineTo(meltState.drip.x + xOff, y);
  }
  context.lineWidth = Math.max(1.5, baseWidth * 0.12);
  context.strokeStyle = `rgba(255, 255, 255, 0.5)`;
  context.stroke();
  context.globalAlpha = 1;
  context.filter = "none";

  // 水滴頭：底部圓、頂部尖的倒泪滴（尖端接在水流末端）
  // 大小跟隨水流末端半徑：水越細水滴越小
  const endR = halfWidthAt(streamHeight);
  const dropW = Math.max(endR * 2.6, 6);
  const dropH = Math.max(endR * 3.4, 8);
  const dropTop = streamTop + streamHeight - dropH * 0.15;
  const [dcr, dcg, dcb] = meltState.drip.rgb;
  // 倒泪滴形：頂端尖點（接水流）、底部圓弧——用貝茲曲線畫
  const tearPath = () => {
    context.beginPath();
    context.moveTo(meltState.drip.x, dropTop);
    context.bezierCurveTo(
      meltState.drip.x + dropW * 0.18, dropTop + dropH * 0.3,
      meltState.drip.x + dropW * 0.5, dropTop + dropH * 0.42,
      meltState.drip.x + dropW * 0.5, dropTop + dropH * 0.62
    );
    context.arc(meltState.drip.x, dropTop + dropH * 0.62, dropW * 0.5, 0, Math.PI, false);
    context.bezierCurveTo(
      meltState.drip.x - dropW * 0.5, dropTop + dropH * 0.42,
      meltState.drip.x - dropW * 0.18, dropTop + dropH * 0.3,
      meltState.drip.x, dropTop
    );
    context.closePath();
  };
  const dropY = dropTop + dropH * 0.62;
  // 水滴本體：徑向漸層立體感（左上高光、邊緣飽和深色）
  const dropGrad = context.createRadialGradient(
    meltState.drip.x - dropW * 0.15, dropY + dropH * 0.05, dropW * 0.08,
    meltState.drip.x, dropY + dropH * 0.05, dropW * 0.6
  );
  dropGrad.addColorStop(0, `rgba(${Math.min(255, dcr + 55)}, ${Math.min(255, dcg + 55)}, ${Math.min(255, dcb + 55)}, 1)`);
  dropGrad.addColorStop(0.55, meltState.drip.color);
  dropGrad.addColorStop(1, `rgba(${Math.round(dcr * 0.5)}, ${Math.round(dcg * 0.5)}, ${Math.round(dcb * 0.5)}, 1)`);
  context.filter = "blur(0.5px)";
  context.fillStyle = dropGrad;
  tearPath();
  context.fill();
  context.filter = "none";
  // 水滴外圈深色描邊：顏料在滴緣堆積變深，強化大顆粒的立體感
  context.globalAlpha = 0.55;
  context.lineWidth = Math.max(2.5, dropW * 0.1);
  context.strokeStyle = `rgba(${Math.round(dcr * 0.5)}, ${Math.round(dcg * 0.5)}, ${Math.round(dcb * 0.5)}, 1)`;
  tearPath();
  context.stroke();
  context.globalAlpha = 1;
  // 水滴高光小點（偏左上，圓潤感）
  context.globalAlpha = 0.9;
  context.fillStyle = "rgba(255,255,255,0.85)";
  context.beginPath();
  context.ellipse(meltState.drip.x - dropW * 0.18, dropTop + dropH * 0.52, dropW * 0.13, dropH * 0.12, -0.4, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  // 融化暈染：沿水流輪廓放大做柔邊暈開（用波形路徑，保持有機邊緣）
  wavePath(1.75, 0.2, 7);
  wavePath(1.35, 0.25, 4);

  // 圈內融化：把按壓點附近的顏料柔化+向下拉，呈現「融化」的糊化感
  // 範圍比按壓圓圈小（0.55 倍半徑），只糊化按壓點中心，再以徑向柔邊遮罩畫回——
  // 邊緣漸淡融入周圍畫面，不會出現方形取色框的硬接縫
  const meltR = radius * 0.55;
  const innerR = Math.max(6, meltR * view.pixelRatio);
  const innerSize = Math.ceil(innerR * 2);
  meltState.canvas.width = innerSize;
  meltState.canvas.height = innerSize;
  meltContext.setTransform(1, 0, 0, 1, 0, 0);
  meltContext.clearRect(0, 0, innerSize, innerSize);
  // 柔化：從當前畫面取圓形外接方形區塊，blur 會順便把周圍顏色混進邊緣
  meltContext.filter = `blur(${2.4 * view.pixelRatio}px)`;
  meltContext.drawImage(
    canvas,
    Math.round((meltState.drip.x - meltR) * view.pixelRatio),
    Math.round((meltState.drip.y - meltR) * view.pixelRatio),
    innerSize, innerSize,
    0, 0, innerSize, innerSize
  );
  meltContext.filter = "none";

  // 徑向柔邊遮罩：中心實、邊緣全透明，融化區塊與畫面自然過渡
  meltContext.globalCompositeOperation = "destination-in";
  const softMask = meltContext.createRadialGradient(innerSize / 2, innerSize / 2, innerSize * 0.14, innerSize / 2, innerSize / 2, innerSize * 0.5);
  softMask.addColorStop(0, "rgba(0, 0, 0, 1)");
  softMask.addColorStop(0.6, "rgba(0, 0, 0, 0.8)");
  softMask.addColorStop(1, "rgba(0, 0, 0, 0)");
  meltContext.fillStyle = softMask;
  meltContext.fillRect(0, 0, innerSize, innerSize);
  meltContext.globalCompositeOperation = "source-over";

  // 畫回畫布：以按壓點為中心畫縮小的融化區塊，內容往下輕微拉長（顏料被拉下來，
  // 拉長不會產生空隙），強度隨按壓時間漸入（0.7 秒），融化是漸進發生而非瞬間跳出
  const meltStrength = Math.min(1, (performance.now() - meltState.pressStart) / 700);
  context.save();
  context.globalAlpha = meltStrength;
  context.drawImage(meltState.canvas, meltState.drip.x - meltR, meltState.drip.y - meltR, meltR * 2, meltR * 2 + speed * 0.6);
  context.restore();

  context.restore();
}