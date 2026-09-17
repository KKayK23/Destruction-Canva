// Tear（撕開）手法：真實沿著滑鼠移動軌跡撕開紙張。
// 核心資料 = 滑鼠連續 movement points：
//   記錄座標點 → 平滑成自由曲線 → 依曲線兩側建立撕裂邊界 → 圖片沿這條曲線分離。
// 沒有固定角度、沒有預設直線、沒有三角形/梯形幾何碎片、沒有旋轉翻折。
// 渲染架構：未位移的完整紙面當底層（畫作外緣永不動＝不會出現白色細框），
// 裂縫附近帶狀區域用羽化遮罩貼上「輕微反向位移」的紙面，中間露出白色裂縫。
import { canvas, context, tearSourceCanvas, tearSourceContext } from "../canvases.js";
import { view, tearState } from "../state.js";

const MAX_GAP = 30;           // 裂縫最大寬度：自然的細縫（使用者回饋太寬）
const GAP_GAIN = 0.3;         // 裂縫張開速度相對於拖曳距離的比例
const PAPER_INSET = 9;        // 紙面內縮量：裁掉照片自帶的白色邊墊（白框來源）
const FRINGE_WIDTH = 7;       // 兩側紙白毛邊細條寬度
const SHADOW_WIDTH = 12;      // 毛邊下的柔和陰影寬度
const EDGE_WOBBLE = 1.6;      // 毛邊路徑的法線抖動幅度（鋸齒狀）
const FIBER_BASE = 3;         // 紙纖維起點與毛邊外緣的距離
const MAX_TURN = 0.7;         // 相鄰法線最大轉角（rad），避免銳角轉折處法線急翻

function makeStroke(x, y) {
  return {
    points: [{ x, y }],
    gap: 0,
    // 每個點的固定隨機數：毛邊寬度、紙纖維、紙屑都在記錄當下決定，
    // 之後每次重繪使用同一組值，邊緣不會閃爍。
    jitter: [Math.random()],
    fibers: [],
    specks: [],
    curve: null,
    curveLen: 0
  };
}

// movement points → 平滑自由曲線：移動平均（權重 1:2:1，端點保留），
// 法線由平滑後曲線的相鄰點差分求得。每個 movement point 都參與裂縫形狀。
function ensureCurve(stroke) {
  const n = stroke.points.length;
  if (stroke.curve && stroke.curveLen === n) return stroke.curve;
  const raw = stroke.points;
  const pts = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i === 0 || i === n - 1) {
      pts[i] = { x: raw[i].x, y: raw[i].y };
    } else {
      pts[i] = {
        x: (raw[i - 1].x + raw[i].x * 2 + raw[i + 1].x) / 4,
        y: (raw[i - 1].y + raw[i].y * 2 + raw[i + 1].y) / 4
      };
    }
  }
  const nrms = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    nrms[i] = { x: -ty / len, y: tx / len };
  }
  // 法線轉角鉗制：鋸齒狀路徑的銳角轉折會讓法線急翻，使邊界摺疊自交。
  let prevX = nrms[0].x;
  let prevY = nrms[0].y;
  for (let i = 1; i < n; i += 1) {
    const dot = Math.min(1, Math.max(-1, nrms[i].x * prevX + nrms[i].y * prevY));
    if (Math.acos(dot) > MAX_TURN) {
      const cross = prevX * nrms[i].y - prevY * nrms[i].x;
      const target = Math.atan2(prevY, prevX) + (cross >= 0 ? MAX_TURN : -MAX_TURN);
      nrms[i] = { x: Math.cos(target), y: Math.sin(target) };
    }
    prevX = nrms[i].x;
    prevY = nrms[i].y;
  }
  stroke.curve = { pts, nrms };
  stroke.curveLen = n;
  return stroke.curve;
}

// 沿方向 dir 從 origin 前進，回傳離開畫布邊界的交點（稍微超出）。
// 延伸點必須落在畫布邊上：若沿切線飛出很遠，「延伸點 → 畫布角落」的
// 閉合線段會斜切畫布、穿越撕裂曲線，造成多邊形自交與交叉空洞。
function rayExitPoint(origin, dirX, dirY, rect) {
  let t = Infinity;
  if (dirX > 1e-6) t = Math.min(t, (rect.x + rect.width + 2 - origin.x) / dirX);
  else if (dirX < -1e-6) t = Math.min(t, (rect.x - 2 - origin.x) / dirX);
  if (dirY > 1e-6) t = Math.min(t, (rect.y + rect.height + 2 - origin.y) / dirY);
  else if (dirY < -1e-6) t = Math.min(t, (rect.y - 2 - origin.y) / dirY);
  if (!Number.isFinite(t) || t <= 0) return { x: origin.x + dirX, y: origin.y + dirY };
  return { x: origin.x + dirX * t, y: origin.y + dirY * t };
}

function snapshotTearSource() {
  // 只快照「畫作紙面」（artworkRect 內縮 PAPER_INSET）：
  // 1) 不把紙外的白色頁面與烘焙陰影帶進紙片（否則平移後浮出幽靈白框）；
  // 2) 內縮裁掉照片自帶的白色邊墊，紙片邊緣＝金框外緣，不會出現細白框。
  const a = view.artworkRect;
  const inset = PAPER_INSET * view.pixelRatio;
  const sx = a.x * view.pixelRatio + inset;
  const sy = a.y * view.pixelRatio + inset;
  const w = Math.max(1, Math.round(a.width * view.pixelRatio - inset * 2));
  const h = Math.max(1, Math.round(a.height * view.pixelRatio - inset * 2));
  if (tearSourceCanvas.width !== w || tearSourceCanvas.height !== h) {
    tearSourceCanvas.width = w;
    tearSourceCanvas.height = h;
  }
  tearSourceContext.setTransform(1, 0, 0, 1, 0, 0);
  tearSourceContext.clearRect(0, 0, w, h);
  tearSourceContext.drawImage(canvas, sx, sy, w, h, 0, 0, w, h);
}

export function startTear(x, y) {
  // 以目前畫面（含其他手法的痕跡與先前的撕裂結果）為撕紙來源
  snapshotTearSource();
  tearState.strokes.length = 0;
  tearState.current = makeStroke(x, y);
  tearState.strokes.push(tearState.current);
}

// 滑鼠移動：把經過的座標點加入撕裂路徑，並讓裂縫逐漸張開。
// 移動停止就不會有任何變化；路徑完全由座標點組成，不自動延伸出新形狀。
export function extendTear(x, y) {
  const stroke = tearState.current;
  if (!stroke) return;
  const last = stroke.points[stroke.points.length - 1];
  const distance = Math.hypot(x - last.x, y - last.y);
  if (distance < 3) return;

  const steps = Math.min(8, Math.max(1, Math.ceil(distance / 12)));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    stroke.points.push({ x: last.x + (x - last.x) * t, y: last.y + (y - last.y) * t });
    stroke.jitter.push(Math.random());
  }
  stroke.gap = Math.min(MAX_GAP, stroke.gap + distance * GAP_GAIN);

  // 預先決定紙纖維與紙屑：沿路徑隨機挑點，位置固定不閃爍
  const index = stroke.points.length - 1;
  if (Math.random() < 0.45) {
    stroke.fibers.push({
      index,
      length: 2.5 + Math.random() * 5,
      width: 0.7 + Math.random() * 1.1,
      lean: (Math.random() - 0.5) * 1.4
    });
  }
  if (Math.random() < 0.3) {
    stroke.specks.push({
      index,
      distance: FIBER_BASE + 2 + Math.random() * 12,
      size: 1 + Math.random() * 2.4,
      along: (Math.random() - 0.5) * 8
    });
  }

  renderTear();
}

export function endTear() {
  // 鬆開滑鼠：保留目前已撕開的結果（strokes 留著，current 清空）
  tearState.current = null;
}

export function clearTears() {
  tearState.strokes.length = 0;
  tearState.current = null;
}

// 撕裂邊界：整條平滑曲線沿「分離軸」剛體平移 side*offset（與內容位移完全
// 同向量，內容撕扯邊緣＝裁切邊界），兩端沿滑鼠自身切線延伸到畫布邊界，
// 再併入位於曲線該側的畫布角落，構成該側的撕裂邊界。
// 剛體平移不會像逐點法線偏移那樣在淺斜／銳角段大幅偏離滑鼠路徑。
function traceSidePath(targetContext, stroke, side, offset, rect, axisX, axisY) {
  const pts = stroke.curve.pts;
  const count = pts.length;
  const shifted = new Array(count);
  for (let i = 0; i < count; i += 1) {
    shifted[i] = {
      x: pts[i].x + axisX * side * offset,
      y: pts[i].y + axisY * side * offset
    };
  }

  const first = shifted[0];
  const last = shifted[count - 1];
  // 起點反向延伸（沿滑鼠自身的起始切線，直到畫布邊界為止）
  let dx = first.x - shifted[1].x;
  let dy = first.y - shifted[1].y;
  let len = Math.hypot(dx, dy) || 1;
  const edgeStart = rayExitPoint(first, dx / len, dy / len, rect);
  // 終點順向延伸
  dx = last.x - shifted[count - 2].x;
  dy = last.y - shifted[count - 2].y;
  len = Math.hypot(dx, dy) || 1;
  const edgeEnd = rayExitPoint(last, dx / len, dy / len, rect);

  // 挑出位於撕裂線 side 側的畫布角落，讓多邊形涵蓋整個單側畫面
  const chordX = edgeEnd.x - edgeStart.x;
  const chordY = edgeEnd.y - edgeStart.y;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ].filter((corner) => (chordX * (corner.y - edgeStart.y) - chordY * (corner.x - edgeStart.x)) * side > 0);
  // 閉合路徑從 edgeEnd（投影最大）沿邊界走回 edgeStart（投影最小），
  // 角點必須依投影「降冪」排列；升冪會讓閉合線段斜切畫布、
  // 穿越撕裂曲線造成多邊形自交（裁切出巨大三角形空洞／兩半交叉）。
  corners.sort((a, b) =>
    ((b.x - edgeStart.x) * chordX + (b.y - edgeStart.y) * chordY)
    - ((a.x - edgeStart.x) * chordX + (a.y - edgeStart.y) * chordY)
  );

  targetContext.moveTo(edgeStart.x, edgeStart.y);
  for (let i = 0; i < count; i += 1) targetContext.lineTo(shifted[i].x, shifted[i].y);
  targetContext.lineTo(edgeEnd.x, edgeEnd.y);
  corners.forEach((corner) => targetContext.lineTo(corner.x, corner.y));
  targetContext.closePath();
}

// 裂縫中心線的描邊路徑：平滑曲線各點沿法線微抖，兩端沿切線延伸到畫布邊界。
// 用 stroke() 畫裂縫帶是圓盤聯集，不論路徑怎麼折都不會產生摺疊或空洞。
function buildStrokePath(targetContext, stroke, rect, wobble) {
  const { pts, nrms } = stroke.curve;
  const jitter = stroke.jitter;
  const count = pts.length;
  let dx = pts[0].x - pts[1].x;
  let dy = pts[0].y - pts[1].y;
  let len = Math.hypot(dx, dy) || 1;
  const start = rayExitPoint(pts[0], dx / len, dy / len, rect);
  dx = pts[count - 1].x - pts[count - 2].x;
  dy = pts[count - 1].y - pts[count - 2].y;
  len = Math.hypot(dx, dy) || 1;
  const end = rayExitPoint(pts[count - 1], dx / len, dy / len, rect);

  targetContext.moveTo(start.x, start.y);
  for (let i = 0; i < count; i += 1) {
    const w = (jitter[i] - 0.5) * 2 * wobble;
    targetContext.lineTo(pts[i].x + nrms[i].x * w, pts[i].y + nrms[i].y * w);
  }
  targetContext.lineTo(end.x, end.y);
}

// 建立單側「撕裂邊緣」的描邊路徑：平滑曲線剛體平移 half·axis 後，
// 各點再沿法線微抖（鋸齒狀毛邊感），兩端沿切線延伸到畫布邊界。
function buildEdgeStrokePath(targetContext, stroke, rect, side, half, axisX, axisY, wobble, jitterShift) {
  const { pts, nrms } = stroke.curve;
  const jitter = stroke.jitter;
  const count = pts.length;
  const edge = (i) => {
    const j = jitter[(i + jitterShift) % count];
    const w = (j - 0.5) * 2 * wobble;
    return {
      x: pts[i].x + axisX * side * half + nrms[i].x * w,
      y: pts[i].y + axisY * side * half + nrms[i].y * w
    };
  };
  let dx = pts[0].x - pts[1].x;
  let dy = pts[0].y - pts[1].y;
  let len = Math.hypot(dx, dy) || 1;
  const start = rayExitPoint(edge(0), dx / len, dy / len, rect);
  dx = pts[count - 1].x - pts[count - 2].x;
  dy = pts[count - 1].y - pts[count - 2].y;
  len = Math.hypot(dx, dy) || 1;
  const end = rayExitPoint(edge(count - 1), dx / len, dy / len, rect);

  targetContext.moveTo(start.x, start.y);
  for (let i = 0; i < count; i += 1) {
    const p = edge(i);
    targetContext.lineTo(p.x, p.y);
  }
  targetContext.lineTo(end.x, end.y);
}

// 裂縫邊緣的紙質撕裂痕跡：兩片各自的撕裂邊緣畫上柔和陰影 + 鋸齒紙白毛邊，
// 中間自然露出空白裂縫（不做實心白帶），再加紙纖維與散落紙屑。
function drawCrackBand(targetContext, stroke, half, rect, axisX, axisY) {
  const { pts, nrms } = stroke.curve;
  const count = pts.length;

  targetContext.save();
  targetContext.lineJoin = "round";
  targetContext.lineCap = "round";

  for (const side of [-1, 1]) {
    // 毛邊下的柔和陰影：落在紙片邊緣，產生撕紙厚度感
    targetContext.save();
    targetContext.filter = "blur(2px)";
    targetContext.strokeStyle = "rgba(48, 40, 30, 0.2)";
    targetContext.lineWidth = SHADOW_WIDTH;
    buildEdgeStrokePath(targetContext, stroke, rect, side, half + 2, axisX, axisY, EDGE_WOBBLE, 11);
    targetContext.stroke();
    targetContext.restore();

    // 紙白毛邊細條本體
    targetContext.strokeStyle = "#f6f2e9";
    targetContext.lineWidth = FRINGE_WIDTH;
    buildEdgeStrokePath(targetContext, stroke, rect, side, half, axisX, axisY, EDGE_WOBBLE, 0);
    targetContext.stroke();

    // 第二層細毛邊（抖動相位錯開）：疊出纖維狀的不規則邊緣
    targetContext.strokeStyle = "rgba(246, 242, 233, 0.85)";
    targetContext.lineWidth = 3;
    buildEdgeStrokePath(targetContext, stroke, rect, side, half + 1.5, axisX, axisY, EDGE_WOBBLE * 1.6, 17);
    targetContext.stroke();
  }
  targetContext.restore();

  // 紙纖維：從兩側毛邊邊緣往裂縫中伸出的細短線
  targetContext.save();
  targetContext.strokeStyle = "rgba(246, 242, 233, 0.95)";
  targetContext.lineCap = "round";
  for (const fiber of stroke.fibers) {
    const i = Math.min(fiber.index, count - 1);
    for (const side of [-1, 1]) {
      const baseDist = half + FIBER_BASE;
      const tipDist = baseDist + fiber.length;
      targetContext.lineWidth = fiber.width;
      targetContext.beginPath();
      targetContext.moveTo(
        pts[i].x + axisX * side * baseDist + nrms[i].x * fiber.lean,
        pts[i].y + axisY * side * baseDist + nrms[i].y * fiber.lean
      );
      targetContext.lineTo(
        pts[i].x + axisX * side * tipDist,
        pts[i].y + axisY * side * tipDist
      );
      targetContext.stroke();
    }
  }
  targetContext.restore();

  // 細小紙屑：散落在裂縫空白內的小白點
  targetContext.save();
  targetContext.fillStyle = "rgba(246, 242, 233, 0.9)";
  for (const speck of stroke.specks) {
    const i = Math.min(speck.index, count - 1);
    const dist = half + speck.distance;
    targetContext.beginPath();
    targetContext.ellipse(
      pts[i].x + axisX * speck.distance + speck.along * -nrms[i].y,
      pts[i].y + axisY * speck.distance + speck.along * nrms[i].x,
      speck.size,
      speck.size * 0.6,
      Math.atan2(nrms[i].y, nrms[i].x),
      0,
      Math.PI * 2
    );
    targetContext.fill();
  }
  targetContext.restore();
}

// 依目前所有撕裂路徑重繪畫布：
// 白底 → 兩片剛體分離（整個半面沿分離軸輕微反向平移）→ 白色裂縫 → 紙質毛邊。
// 只在撕裂狀態改變時呼叫（事件驅動），不做逐幀動畫。
export function renderTear() {
  if (!tearSourceCanvas.width) return;
  const ratio = view.pixelRatio;
  const rect = { x: 0, y: 0, width: canvas.width / ratio, height: canvas.height / ratio };
  const a = view.artworkRect;
  const px0 = a.x + PAPER_INSET;
  const py0 = a.y + PAPER_INSET;
  const pw = a.width - PAPER_INSET * 2;
  const ph = a.height - PAPER_INSET * 2;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();

  for (const stroke of tearState.strokes) {
    if (stroke.points.length < 2 || stroke.gap < 1) continue;
    const curve = ensureCurve(stroke);
    const half = stroke.gap / 2;

    // 分離軸 = 撕裂曲線整體走向（起訖弦）的垂直向量；
    // S 型、波浪型等彎曲路徑也能得到穩定且由滑鼠決定的軸向。
    const first = curve.pts[0];
    const last = curve.pts[curve.pts.length - 1];
    let ax = last.x - first.x;
    let ay = last.y - first.y;
    let alen = Math.hypot(ax, ay);
    if (alen < 20) {
      // 弦過短（來回拖曳）：退回所有點法線的平均
      let nx = 0;
      let ny = 0;
      for (const nrm of curve.nrms) {
        nx += nrm.x;
        ny += nrm.y;
      }
      const nlen = Math.hypot(nx, ny);
      ax = nlen > 0.05 ? nx / nlen : curve.nrms[0].x;
      ay = nlen > 0.05 ? ny / nlen : curve.nrms[0].y;
    } else {
      ax /= alen;
      ay /= alen;
    }
    const axisX = -ay;
    const axisY = ax;

    // 兩片剛體分離：整個半面沿分離軸輕微反向平移（撕開成兩半的拉扯感）。
    // 位移量小（≤15px），紙片外緣位移處露出的桌面白與頁面同色，不會形成白框；
    // 撕縫兩側的內容錯位＋毛邊讓兩半清楚分離。
    for (const side of [-1, 1]) {
      context.save();
      // 撕裂邊界：整條曲線沿分離軸剛體平移 half+2（與內容位移同向同量）
      context.beginPath();
      traceSidePath(context, stroke, side, half + 2, rect, axisX, axisY);
      context.clip();
      context.shadowColor = "rgba(35, 27, 18, 0.1)";
      context.shadowBlur = 10;
      context.shadowOffsetY = 4;
      context.drawImage(
        tearSourceCanvas,
        0, 0, tearSourceCanvas.width, tearSourceCanvas.height,
        view.artworkRect.x + PAPER_INSET + axisX * side * half,
        view.artworkRect.y + PAPER_INSET + axisY * side * half,
        view.artworkRect.width - PAPER_INSET * 2,
        view.artworkRect.height - PAPER_INSET * 2
      );
      context.restore();
    }

    // 白色裂縫：畫在位移層之上，保證撕縫中間是乾淨的空白空間
    context.save();
    context.strokeStyle = "#fff";
    context.lineWidth = stroke.gap;
    context.lineJoin = "round";
    context.lineCap = "round";
    buildStrokePath(context, stroke, rect, 1);
    context.stroke();
    context.restore();

    // 裂縫邊緣紙質痕跡（兩側陰影 + 鋸齒毛邊 + 纖維紙屑）：描邊實作，沿曲線永不摺疊。
    // 只畫在內縮後的畫作紙面內，不會延伸到頁面邊界。
    context.save();
    context.beginPath();
    context.rect(
      px0,
      py0,
      pw,
      ph
    );
    context.clip();
    drawCrackBand(context, stroke, half, rect, axisX, axisY);
    context.restore();
  }
}
