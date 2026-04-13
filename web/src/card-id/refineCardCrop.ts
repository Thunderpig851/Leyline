export type RefinedCardCropResult = {
  roiDebugUrl: string;
  candidateUrl: string;
  nameBandUrl: string;
  manaBandUrl: string;
  typeBandUrl: string;
  statusText: string;
};

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number; score: number };
type RotationCandidate = {
  angleDeg: number;
  rect: Rect;
  quad: Point[];
  roiDebugUrl: string;
  candidateUrl: string;
  nameBandUrl: string;
  manaBandUrl: string;
  typeBandUrl: string;
  statusText: string;
  score: number;
};

type GrayscaleData = {
  gray: Uint8Array;
  width: number;
  height: number;
};

type RotatedStats = ReturnType<typeof buildRotatedStats>;

const CARD_ASPECT = 63 / 88;
const ROTATION_ANALYSIS_LONG_SIDE = 520;
const ENHANCED_CARD_LONG_SIDE = 1800;

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): Promise<Blob>
{
  return new Promise((resolve, reject) =>
  {
    canvas.toBlob((blob) =>
    {
      if (!blob)
      {
        reject(new Error("Failed to encode canvas blob"));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92)
{
  const blob = await canvasToBlob(canvas, type, quality);
  return URL.createObjectURL(blob);
}

function clamp(value: number, min: number, max: number)
{
  return Math.max(min, Math.min(max, value));
}

function buildGrayscale(imageData: ImageData): GrayscaleData
{
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1)
  {
    gray[p] = Math.round(
      data[i] * 0.299 +
      data[i + 1] * 0.587 +
      data[i + 2] * 0.114
    );
  }

  return { gray, width, height };
}

function createCanvasFromImageData(imageData: ImageData)
{
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create canvas context");
  }

  ctx.putImageData(imageData, 0, 0);
  return { canvas, ctx };
}

function resizeCanvas(source: HTMLCanvasElement, maxLongSide: number)
{
  const scale = Math.min(1, maxLongSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create resized canvas context");
  }

  ctx.drawImage(source, 0, 0, width, height);
  return { canvas, ctx, scale };
}

function estimateDominantLineAngle(
  imageData: ImageData,
  clickX: number,
  clickY: number
)
{
  const { gray, width, height } = buildGrayscale(imageData);
  const bins = 48;
  const histogram = new Float32Array(bins);
  const radius = Math.max(28, Math.min(width, height) * 0.46);
  const radiusSq = radius * radius;
  const threshold = 24;

  for (let y = 1; y < height - 1; y += 1)
  {
    for (let x = 1; x < width - 1; x += 1)
    {
      const dx = x - clickX;
      const dy = y - clickY;
      const distSq = dx * dx + dy * dy;

      if (distSq > radiusSq)
      {
        continue;
      }

      const idx = y * width + x;
      const gx =
        gray[idx + 1] - gray[idx - 1] +
        gray[idx - width + 1] - gray[idx - width - 1] +
        gray[idx + width + 1] - gray[idx + width - 1];
      const gy =
        gray[idx + width] - gray[idx - width] +
        gray[idx + width - 1] - gray[idx - width - 1] +
        gray[idx + width + 1] - gray[idx - width + 1];
      const mag = Math.abs(gx) + Math.abs(gy);

      if (mag < threshold)
      {
        continue;
      }

      let lineAngle = Math.atan2(gy, gx) + Math.PI / 2;
      while (lineAngle < 0) lineAngle += Math.PI;
      while (lineAngle >= Math.PI) lineAngle -= Math.PI;

      const bin = Math.max(0, Math.min(bins - 1, Math.floor((lineAngle / Math.PI) * bins)));
      const proximity = 1 - Math.sqrt(distSq) / radius;
      histogram[bin] += mag * (0.4 + proximity * 0.6);
    }
  }

  const smoothed = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1)
  {
    const prev = histogram[(i - 1 + bins) % bins];
    const cur = histogram[i];
    const next = histogram[(i + 1) % bins];
    smoothed[i] = prev * 0.25 + cur * 0.5 + next * 0.25;
  }

  let bestBin = 0;
  let bestValue = -Infinity;
  let total = 0;

  for (let i = 0; i < bins; i += 1)
  {
    total += smoothed[i];
    if (smoothed[i] > bestValue)
    {
      bestValue = smoothed[i];
      bestBin = i;
    }
  }

  const confidence = total > 0 ? bestValue / total : 0;
  const angleRad = ((bestBin + 0.5) / bins) * Math.PI;

  return { angleRad, confidence };
}

function rotateCanvas(source: HTMLCanvasElement, angleDeg: number)
{
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const width = source.width;
  const height = source.height;
  const outWidth = Math.max(1, Math.ceil(Math.abs(width * cos) + Math.abs(height * sin)));
  const outHeight = Math.max(1, Math.ceil(Math.abs(width * sin) + Math.abs(height * cos)));

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create rotated canvas context");
  }

  ctx.translate(outWidth / 2, outHeight / 2);
  ctx.rotate(angleRad);
  ctx.drawImage(source, -width / 2, -height / 2);

  return { canvas, ctx, outWidth, outHeight };
}

function rotatePoint(
  point: Point,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  angleDeg: number
): Point
{
  const angleRad = (angleDeg * Math.PI) / 180;
  const dx = point.x - srcWidth / 2;
  const dy = point.y - srcHeight / 2;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  return {
    x: dx * cos - dy * sin + dstWidth / 2,
    y: dx * sin + dy * cos + dstHeight / 2,
  };
}

function inverseRotatePoint(
  point: Point,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  angleDeg: number
): Point
{
  return rotatePoint(point, dstWidth, dstHeight, srcWidth, srcHeight, -angleDeg);
}

function buildIntegral(gray: Uint8Array, mag: Float32Array, width: number, height: number)
{
  const intGray = new Float64Array((width + 1) * (height + 1));
  const intMag = new Float64Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y += 1)
  {
    let rowGray = 0;
    let rowMag = 0;

    for (let x = 1; x <= width; x += 1)
    {
      const idx = (y - 1) * width + (x - 1);
      rowGray += gray[idx];
      rowMag += mag[idx];

      const integralIdx = y * (width + 1) + x;
      intGray[integralIdx] = intGray[(y - 1) * (width + 1) + x] + rowGray;
      intMag[integralIdx] = intMag[(y - 1) * (width + 1) + x] + rowMag;
    }
  }

  return { intGray, intMag };
}

function rectSum(integral: Float64Array, width: number, x: number, y: number, w: number, h: number)
{
  const x1 = clamp(Math.round(x), 0, width);
  const y1 = clamp(Math.round(y), 0, Math.floor(integral.length / (width + 1)) - 1);
  const x2 = clamp(Math.round(x + w), x1, width);
  const y2 = clamp(Math.round(y + h), y1, Math.floor(integral.length / (width + 1)) - 1);
  const stride = width + 1;

  return (
    integral[y2 * stride + x2] -
    integral[y1 * stride + x2] -
    integral[y2 * stride + x1] +
    integral[y1 * stride + x1]
  );
}

function averageRect(integral: Float64Array, width: number, x: number, y: number, w: number, h: number)
{
  const safeW = Math.max(1, w);
  const safeH = Math.max(1, h);
  const area = Math.max(1, safeW * safeH);
  return rectSum(integral, width, x, y, safeW, safeH) / area;
}

function buildRotatedStats(rotatedImageData: ImageData)
{
  const { gray, width, height } = buildGrayscale(rotatedImageData);
  const mag = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y += 1)
  {
    for (let x = 1; x < width - 1; x += 1)
    {
      const idx = y * width + x;
      const gx = gray[idx + 1] - gray[idx - 1];
      const gy = gray[idx + width] - gray[idx - width];
      mag[idx] = Math.abs(gx) + Math.abs(gy);
    }
  }

  const { intGray, intMag } = buildIntegral(gray, mag, width, height);
  return { gray, mag, intGray, intMag, width, height };
}

function sampleScalar(data: ArrayLike<number>, width: number, height: number, x: number, y: number)
{
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const a = data[y0 * width + x0];
  const b = data[y0 * width + x1];
  const c = data[y1 * width + x0];
  const d = data[y1 * width + x1];

  const top = a * (1 - fx) + b * fx;
  const bottom = c * (1 - fx) + d * fx;
  return top * (1 - fy) + bottom * fy;
}

function lineAverage(data: ArrayLike<number>, width: number, height: number, p1: Point, p2: Point, samples = 24)
{
  let total = 0;
  const steps = Math.max(2, samples);

  for (let i = 0; i < steps; i += 1)
  {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;
    total += sampleScalar(data, width, height, x, y);
  }

  return total / steps;
}

function pointInConvexQuad(point: Point, quad: Point[])
{
  let sign = 0;

  for (let i = 0; i < 4; i += 1)
  {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    const currentSign = Math.sign(cross);

    if (currentSign === 0)
    {
      continue;
    }

    if (sign === 0)
    {
      sign = currentSign;
      continue;
    }

    if (currentSign !== sign)
    {
      return false;
    }
  }

  return true;
}

function distancePointToSegment(point: Point, a: Point, b: Point)
{
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-6)
  {
    return Math.hypot(apx, apy);
  }

  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const projX = a.x + abx * t;
  const projY = a.y + aby * t;
  return Math.hypot(point.x - projX, point.y - projY);
}

function quadCenter(quad: Point[])
{
  let x = 0;
  let y = 0;
  for (const point of quad)
  {
    x += point.x;
    y += point.y;
  }
  return { x: x / quad.length, y: y / quad.length };
}

function quadMetrics(quad: Point[])
{
  const top = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const right = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
  const bottom = Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y);
  const left = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  const area = polygonArea(quad);
  const aspect = width / Math.max(1e-6, height);
  return { top, right, bottom, left, width, height, area, aspect };
}

function polygonArea(points: Point[])
{
  let total = 0;
  for (let i = 0; i < points.length; i += 1)
  {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return Math.abs(total) / 2;
}

function isConvexQuad(quad: Point[])
{
  if (quad.length !== 4)
  {
    return false;
  }

  let sign = 0;
  for (let i = 0; i < 4; i += 1)
  {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const currentSign = Math.sign(cross);
    if (currentSign === 0)
    {
      continue;
    }
    if (sign === 0)
    {
      sign = currentSign;
      continue;
    }
    if (currentSign !== sign)
    {
      return false;
    }
  }
  return true;
}

function buildQuadFromRect(rect: Rect): Point[]
{
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function evaluateRectScore(
  stats: RotatedStats,
  rect: Rect,
  anchorX: number,
  anchorY: number,
  clickX: number,
  clickY: number
)
{
  const { intGray, intMag, width, height } = stats;
  const x = rect.x;
  const y = rect.y;
  const w = rect.width;
  const h = rect.height;

  if (x < 2 || y < 2 || x + w >= width - 2 || y + h >= height - 2)
  {
    return -Infinity;
  }

  if (clickX < x || clickX > x + w || clickY < y || clickY > y + h)
  {
    return -Infinity;
  }

  const band = Math.max(2, Math.round(Math.min(w, h) * 0.05));
  const innerX = x + band * 2;
  const innerY = y + band * 2;
  const innerW = Math.max(1, w - band * 4);
  const innerH = Math.max(1, h - band * 4);

  const topMag = averageRect(intMag, width, x, y, w, band);
  const bottomMag = averageRect(intMag, width, x, y + h - band, w, band);
  const leftMag = averageRect(intMag, width, x, y, band, h);
  const rightMag = averageRect(intMag, width, x + w - band, y, band, h);
  const innerMag = averageRect(intMag, width, innerX, innerY, innerW, innerH);

  const topDark = 255 - averageRect(intGray, width, x, y, w, band);
  const bottomDark = 255 - averageRect(intGray, width, x, y + h - band, w, band);
  const leftDark = 255 - averageRect(intGray, width, x, y, band, h);
  const rightDark = 255 - averageRect(intGray, width, x + w - band, y, band, h);
  const innerDark = 255 - averageRect(intGray, width, innerX, innerY, innerW, innerH);

  const borderSupport = (
    (topMag + bottomMag + leftMag + rightMag) / 4 - innerMag * 0.42
  );

  const borderDark = (
    (topDark + bottomDark + leftDark + rightDark) / 4 - innerDark * 0.22
  );

  const expandedX = Math.max(0, x - band);
  const expandedY = Math.max(0, y - band);
  const expandedW = Math.min(width - expandedX, w + band * 2);
  const expandedH = Math.min(height - expandedY, h + band * 2);
  const expandedMag = averageRect(intMag, width, expandedX, expandedY, expandedW, expandedH);
  const outsidePenalty = Math.max(0, expandedMag - (topMag + bottomMag + leftMag + rightMag) / 4);

  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const anchorDist = Math.hypot(anchorX - centerX, anchorY - centerY);

  const nx = (clickX - x) / w;
  const ny = (clickY - y) / h;
  const margin = Math.min(nx, 1 - nx, ny, 1 - ny);
  const clickMarginBonus = margin >= 0.12
    ? 18 * Math.min(1, (margin - 0.12) / 0.16)
    : -28 * Math.min(1, (0.12 - margin) / 0.12);

  const areaBonus = Math.sqrt(Math.max(1, w * h)) * 0.55;
  const tallBias = h * 0.06;

  return borderSupport * 2.7 + borderDark * 1.1 + areaBonus + tallBias + clickMarginBonus - outsidePenalty * 1.25 - anchorDist * 0.52;
}

function evaluateQuadScore(
  stats: RotatedStats,
  quad: Point[],
  anchor: Point,
  click: Point
)
{
  if (!isConvexQuad(quad))
  {
    return -Infinity;
  }

  for (const point of quad)
  {
    if (point.x < 2 || point.y < 2 || point.x > stats.width - 2 || point.y > stats.height - 2)
    {
      return -Infinity;
    }
  }

  if (!pointInConvexQuad(click, quad))
  {
    return -Infinity;
  }

  const metrics = quadMetrics(quad);
  if (metrics.area < 400)
  {
    return -Infinity;
  }

  const aspectPenalty = Math.abs(metrics.aspect - CARD_ASPECT);
  const topMag = lineAverage(stats.mag, stats.width, stats.height, quad[0], quad[1], 20);
  const rightMag = lineAverage(stats.mag, stats.width, stats.height, quad[1], quad[2], 20);
  const bottomMag = lineAverage(stats.mag, stats.width, stats.height, quad[3], quad[2], 20);
  const leftMag = lineAverage(stats.mag, stats.width, stats.height, quad[0], quad[3], 20);

  const topDark = 255 - lineAverage(stats.gray, stats.width, stats.height, quad[0], quad[1], 20);
  const rightDark = 255 - lineAverage(stats.gray, stats.width, stats.height, quad[1], quad[2], 20);
  const bottomDark = 255 - lineAverage(stats.gray, stats.width, stats.height, quad[3], quad[2], 20);
  const leftDark = 255 - lineAverage(stats.gray, stats.width, stats.height, quad[0], quad[3], 20);

  const center = quadCenter(quad);
  const anchorDist = Math.hypot(center.x - anchor.x, center.y - anchor.y);
  const clickEdgeDistances = [
    distancePointToSegment(click, quad[0], quad[1]),
    distancePointToSegment(click, quad[1], quad[2]),
    distancePointToSegment(click, quad[2], quad[3]),
    distancePointToSegment(click, quad[3], quad[0]),
  ];
  const margin = Math.min(...clickEdgeDistances) / Math.max(1, Math.min(metrics.width, metrics.height));
  const clickMarginBonus = margin >= 0.14
    ? 24 * Math.min(1, (margin - 0.14) / 0.18)
    : -36 * Math.min(1, (0.14 - margin) / 0.14);

  const areaBonus = Math.sqrt(metrics.area) * 0.75;
  const edgeSupport = (topMag + rightMag + bottomMag + leftMag) / 4;
  const borderDark = (topDark + rightDark + bottomDark + leftDark) / 4;
  const parallelPenalty = Math.abs(metrics.top - metrics.bottom) * 0.25 + Math.abs(metrics.left - metrics.right) * 0.2;

  return edgeSupport * 3.2 + borderDark * 0.9 + areaBonus + clickMarginBonus - aspectPenalty * 240 - parallelPenalty - anchorDist * 0.5;
}

function broadSearchRect(
  stats: RotatedStats,
  clickX: number,
  clickY: number
)
{
  const { width, height } = stats;
  const offsetsX = [-26, -18, -12, -6, 0, 6, 12, 18, 26];
  const offsetsY = [-34, -22, -14, -8, 0, 8, 14, 22, 34];
  const heights: number[] = [];
  const minH = Math.max(54, Math.round(height * 0.28));
  const maxH = Math.min(height - 8, Math.round(height * 0.94), Math.round((width - 8) / CARD_ASPECT));

  for (let h = minH; h <= maxH; h += 8)
  {
    heights.push(h);
  }

  let best: Rect | null = null;

  for (const candidateHeight of heights)
  {
    const candidateWidth = Math.round(candidateHeight * CARD_ASPECT);
    if (candidateWidth < 34 || candidateWidth >= width - 4)
    {
      continue;
    }

    for (const offsetX of offsetsX)
    {
      for (const offsetY of offsetsY)
      {
        const cx = clickX + offsetX;
        const cy = clickY + offsetY;
        const rect: Rect = {
          x: Math.round(cx - candidateWidth / 2),
          y: Math.round(cy - candidateHeight / 2),
          width: candidateWidth,
          height: candidateHeight,
          score: 0,
        };

        const score = evaluateRectScore(stats, rect, clickX, clickY, clickX, clickY);
        if (!Number.isFinite(score))
        {
          continue;
        }

        rect.score = score;
        if (!best || score > best.score)
        {
          best = rect;
        }
      }
    }
  }

  if (best)
  {
    return best;
  }

  const fallbackHeight = Math.max(90, Math.round(height * 0.56));
  const fallbackWidth = Math.max(64, Math.round(fallbackHeight * CARD_ASPECT));
  return {
    x: clamp(Math.round(clickX - fallbackWidth / 2), 0, width - fallbackWidth),
    y: clamp(Math.round(clickY - fallbackHeight / 2), 0, height - fallbackHeight),
    width: fallbackWidth,
    height: fallbackHeight,
    score: 0,
  };
}

function refineRectAroundSeed(
  stats: RotatedStats,
  clickX: number,
  clickY: number,
  seedRect: Rect
)
{
  let best = { ...seedRect };
  const sizeScales = [0.9, 0.96, 1.0, 1.06, 1.12, 1.2, 1.28, 1.36];
  const shifts = [-18, -12, -8, -4, 0, 4, 8, 12, 18];

  for (let pass = 0; pass < 2; pass += 1)
  {
    const anchorX = best.x + best.width / 2;
    const anchorY = best.y + best.height / 2;
    let improved = best;

    for (const sizeScale of sizeScales)
    {
      const candidateHeight = Math.round(best.height * sizeScale);
      const candidateWidth = Math.round(candidateHeight * CARD_ASPECT);

      for (const shiftX of shifts)
      {
        for (const shiftY of shifts)
        {
          const rect: Rect = {
            x: Math.round(anchorX + shiftX - candidateWidth / 2),
            y: Math.round(anchorY + shiftY - candidateHeight / 2),
            width: candidateWidth,
            height: candidateHeight,
            score: 0,
          };

          const score = evaluateRectScore(stats, rect, anchorX, anchorY, clickX, clickY);
          if (!Number.isFinite(score))
          {
            continue;
          }

          rect.score = score;
          if (score > improved.score)
          {
            improved = rect;
          }
        }
      }
    }

    best = improved;
  }

  const expandX = Math.max(2, Math.round(best.width * 0.05));
  const expandY = Math.max(2, Math.round(best.height * 0.05));
  return {
    x: clamp(best.x - expandX, 0, stats.width - 1),
    y: clamp(best.y - expandY, 0, stats.height - 1),
    width: clamp(best.width + expandX * 2, 1, stats.width),
    height: clamp(best.height + expandY * 2, 1, stats.height),
    score: best.score,
  };
}

function refineQuadAroundRect(
  stats: RotatedStats,
  click: Point,
  rect: Rect
)
{
  let bestQuad = buildQuadFromRect(rect);
  let bestScore = evaluateQuadScore(stats, bestQuad, quadCenter(bestQuad), click);

  const deltas = [-8, -4, 0, 4, 8];

  for (let pass = 0; pass < 3; pass += 1)
  {
    let improved = false;

    for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1)
    {
      const originalPoint = bestQuad[cornerIndex];
      let cornerBestPoint = originalPoint;
      let cornerBestScore = bestScore;

      for (const dx of deltas)
      {
        for (const dy of deltas)
        {
          if (dx === 0 && dy === 0)
          {
            continue;
          }

          const candidateQuad = bestQuad.map((point, index) =>
            index === cornerIndex
              ? { x: point.x + dx, y: point.y + dy }
              : { ...point }
          );

          const score = evaluateQuadScore(stats, candidateQuad, quadCenter(bestQuad), click);
          if (score > cornerBestScore)
          {
            cornerBestScore = score;
            cornerBestPoint = candidateQuad[cornerIndex];
          }
        }
      }

      if (cornerBestPoint !== originalPoint)
      {
        bestQuad = bestQuad.map((point, index) =>
          index === cornerIndex ? { ...cornerBestPoint } : point
        );
        bestScore = cornerBestScore;
        improved = true;
      }
    }

    if (!improved)
    {
      break;
    }
  }

  const center = quadCenter(bestQuad);
  const expanded = bestQuad.map((point) => ({
    x: center.x + (point.x - center.x) * 1.05,
    y: center.y + (point.y - center.y) * 1.05,
  }));

  const expandedScore = evaluateQuadScore(stats, expanded, center, click);
  return expandedScore > bestScore ? expanded : bestQuad;
}

function drawPolygon(ctx: CanvasRenderingContext2D, points: Point[])
{
  if (points.length === 0)
  {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1)
  {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function rotatePortraitIfNeeded(canvas: HTMLCanvasElement)
{
  if (canvas.height >= canvas.width)
  {
    return canvas;
  }

  const rotated = document.createElement("canvas");
  rotated.width = canvas.height;
  rotated.height = canvas.width;
  const ctx = rotated.getContext("2d");

  if (!ctx)
  {
    throw new Error("Could not create portrait rotation canvas");
  }

  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return rotated;
}

function upscaleCanvas(source: HTMLCanvasElement, targetLongSide: number)
{
  const longSide = Math.max(source.width, source.height);
  const scale = Math.max(1, targetLongSide / longSide);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create upscale canvas context");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "brightness(1.04) contrast(1.14) saturate(1.06)";
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";
  return canvas;
}

function sharpenCanvas(source: HTMLCanvasElement, amount = 0.34)
{
  const ctx = source.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create sharpen canvas context");
  }

  const { width, height } = source;
  const srcImage = ctx.getImageData(0, 0, width, height);
  const src = srcImage.data;
  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < height; y += 1)
  {
    for (let x = 0; x < width; x += 1)
    {
      const idx = (y * width + x) * 4;

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1)
      {
        out[idx] = src[idx];
        out[idx + 1] = src[idx + 1];
        out[idx + 2] = src[idx + 2];
        out[idx + 3] = src[idx + 3];
        continue;
      }

      for (let channel = 0; channel < 3; channel += 1)
      {
        const c = idx + channel;
        const sharpened = (
          src[c] * 5 -
          src[c - 4] -
          src[c + 4] -
          src[c - width * 4] -
          src[c + width * 4]
        );
        const blended = src[c] * (1 - amount) + sharpened * amount;
        out[c] = Math.round(clamp(blended, 0, 255));
      }

      out[idx + 3] = src[idx + 3];
    }
  }

  const outImage = new ImageData(out, width, height);
  ctx.putImageData(outImage, 0, 0);
  return source;
}

function buildEdgeProfiles(source: HTMLCanvasElement)
{
  const ctx = source.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create edge profile context");
  }

  const imageData = ctx.getImageData(0, 0, source.width, source.height);
  const { gray, width, height } = buildGrayscale(imageData);
  const colProfile = new Float32Array(width);
  const rowProfile = new Float32Array(height);
  const innerTop = Math.round(height * 0.08);
  const innerBottom = Math.max(innerTop + 2, Math.round(height * 0.92));
  const innerLeft = Math.round(width * 0.08);
  const innerRight = Math.max(innerLeft + 2, Math.round(width * 0.92));

  for (let x = 1; x < width - 1; x += 1)
  {
    let total = 0;
    for (let y = innerTop; y < innerBottom; y += 1)
    {
      const idx = y * width + x;
      const edge = Math.abs(gray[idx + 1] - gray[idx - 1]);
      const dark = 255 - gray[idx];
      total += edge * 1.2 + dark * 0.24;
    }
    colProfile[x] = total / Math.max(1, innerBottom - innerTop);
  }

  for (let y = 1; y < height - 1; y += 1)
  {
    let total = 0;
    for (let x = innerLeft; x < innerRight; x += 1)
    {
      const idx = y * width + x;
      const edge = Math.abs(gray[idx + width] - gray[idx - width]);
      const dark = 255 - gray[idx];
      total += edge * 1.2 + dark * 0.24;
    }
    rowProfile[y] = total / Math.max(1, innerRight - innerLeft);
  }

  return { colProfile, rowProfile };
}

function smoothProfile(profile: Float32Array, radius = 2)
{
  const out = new Float32Array(profile.length);

  for (let i = 0; i < profile.length; i += 1)
  {
    let total = 0;
    let count = 0;

    for (let offset = -radius; offset <= radius; offset += 1)
    {
      const idx = i + offset;
      if (idx < 0 || idx >= profile.length)
      {
        continue;
      }
      total += profile[idx];
      count += 1;
    }

    out[i] = count > 0 ? total / count : profile[i];
  }

  return out;
}

function findProfilePeak(profile: Float32Array, start: number, end: number)
{
  let bestIndex = start;
  let bestValue = -Infinity;

  for (let i = start; i <= end; i += 1)
  {
    if (profile[i] > bestValue)
    {
      bestValue = profile[i];
      bestIndex = i;
    }
  }

  return bestIndex;
}

function cropCanvas(source: HTMLCanvasElement, x: number, y: number, width: number, height: number)
{
  const safeX = clamp(Math.round(x), 0, source.width - 1);
  const safeY = clamp(Math.round(y), 0, source.height - 1);
  const safeWidth = clamp(Math.round(width), 1, source.width - safeX);
  const safeHeight = clamp(Math.round(height), 1, source.height - safeY);
  const out = document.createElement("canvas");
  out.width = safeWidth;
  out.height = safeHeight;
  const ctx = out.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create crop canvas context");
  }

  ctx.drawImage(source, safeX, safeY, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);
  return out;
}

function tightenWarpedCardCanvas(source: HTMLCanvasElement)
{
  const { colProfile, rowProfile } = buildEdgeProfiles(source);
  const smoothCols = smoothProfile(colProfile, 3);
  const smoothRows = smoothProfile(rowProfile, 3);

  const leftPeak = findProfilePeak(smoothCols, 2, Math.max(3, Math.round(source.width * 0.18)));
  const rightPeak = findProfilePeak(
    smoothCols,
    Math.max(2, Math.round(source.width * 0.82)),
    Math.max(2, source.width - 3)
  );
  const topPeak = findProfilePeak(smoothRows, 2, Math.max(3, Math.round(source.height * 0.18)));
  const bottomPeak = findProfilePeak(
    smoothRows,
    Math.max(2, Math.round(source.height * 0.82)),
    Math.max(2, source.height - 3)
  );

  let cropLeft = Math.max(0, leftPeak - 2);
  let cropRight = Math.min(source.width - 1, rightPeak + 2);
  let cropTop = Math.max(0, topPeak - 2);
  let cropBottom = Math.min(source.height - 1, bottomPeak + 2);

  let cropWidth = cropRight - cropLeft + 1;
  let cropHeight = cropBottom - cropTop + 1;

  if (cropWidth < source.width * 0.62 || cropHeight < source.height * 0.62)
  {
    return source;
  }

  const centerX = cropLeft + cropWidth / 2;
  const centerY = cropTop + cropHeight / 2;
  const aspect = cropWidth / Math.max(1, cropHeight);

  if (Math.abs(aspect - CARD_ASPECT) > 0.05)
  {
    if (aspect > CARD_ASPECT)
    {
      cropWidth = Math.round(cropHeight * CARD_ASPECT);
    }
    else
    {
      cropHeight = Math.round(cropWidth / CARD_ASPECT);
    }

    cropLeft = clamp(Math.round(centerX - cropWidth / 2), 0, source.width - cropWidth);
    cropTop = clamp(Math.round(centerY - cropHeight / 2), 0, source.height - cropHeight);
  }

  return cropCanvas(source, cropLeft, cropTop, cropWidth, cropHeight);
}

function normalizeLevelsCanvas(source: HTMLCanvasElement)
{
  const ctx = source.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create normalize canvas context");
  }

  const image = ctx.getImageData(0, 0, source.width, source.height);
  const { data } = image;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4)
  {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const span = Math.max(24, max - min);

  for (let i = 0; i < data.length; i += 4)
  {
    for (let channel = 0; channel < 3; channel += 1)
    {
      const normalized = ((data[i + channel] - min) * 255) / span;
      data[i + channel] = clamp(Math.round(normalized), 0, 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  return source;
}

function extractBandCanvas(
  source: HTMLCanvasElement,
  region: { left: number; top: number; width: number; height: number },
  targetWidth: number
)
{
  const x = clamp(Math.round(source.width * region.left), 0, source.width - 1);
  const y = clamp(Math.round(source.height * region.top), 0, source.height - 1);
  const width = clamp(Math.round(source.width * region.width), 1, source.width - x);
  const height = clamp(Math.round(source.height * region.height), 1, source.height - y);
  const cropped = cropCanvas(source, x, y, width, height);
  const scale = Math.max(1, targetWidth / Math.max(1, cropped.width));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropped.width * scale));
  out.height = Math.max(1, Math.round(cropped.height * scale));
  const outCtx = out.getContext("2d", { willReadFrequently: true });

  if (!outCtx)
  {
    throw new Error("Could not create band canvas context");
  }

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(cropped, 0, 0, out.width, out.height);

  return sharpenCanvas(normalizeLevelsCanvas(out), 0.22);
}

function enhanceCandidateCanvas(source: HTMLCanvasElement)
{
  const tightened = tightenWarpedCardCanvas(source);
  const portrait = rotatePortraitIfNeeded(tightened);
  const enhanced = upscaleCanvas(portrait, ENHANCED_CARD_LONG_SIDE);
  return sharpenCanvas(normalizeLevelsCanvas(enhanced), 0.22);
}

function solveLinearSystem(matrix: number[][], vector: number[])
{
  const n = vector.length;
  const a = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

  for (let col = 0; col < n; col += 1)
  {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1)
    {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col]))
      {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][col]) < 1e-8)
    {
      throw new Error("Singular matrix");
    }

    if (pivot !== col)
    {
      [a[col], a[pivot]] = [a[pivot], a[col]];
    }

    const pivotValue = a[col][col];
    for (let j = col; j <= n; j += 1)
    {
      a[col][j] /= pivotValue;
    }

    for (let row = 0; row < n; row += 1)
    {
      if (row === col)
      {
        continue;
      }

      const factor = a[row][col];
      for (let j = col; j <= n; j += 1)
      {
        a[row][j] -= factor * a[col][j];
      }
    }
  }

  return a.map((row) => row[n]);
}

function computeHomography(dstPts: Point[], srcPts: Point[])
{
  const matrix: number[][] = [];
  const vector: number[] = [];

  for (let i = 0; i < 4; i += 1)
  {
    const x = dstPts[i].x;
    const y = dstPts[i].y;
    const u = srcPts[i].x;
    const v = srcPts[i].y;

    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const [h11, h12, h13, h21, h22, h23, h31, h32] = solveLinearSystem(matrix, vector);
  return [h11, h12, h13, h21, h22, h23, h31, h32, 1];
}

function applyHomography(h: number[], x: number, y: number): Point
{
  const denom = h[6] * x + h[7] * y + h[8];
  if (Math.abs(denom) < 1e-8)
  {
    return { x: 0, y: 0 };
  }
  return {
    x: (h[0] * x + h[1] * y + h[2]) / denom,
    y: (h[3] * x + h[4] * y + h[5]) / denom,
  };
}

function sampleRgba(data: Uint8ClampedArray, width: number, height: number, x: number, y: number)
{
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  const out = [0, 0, 0, 255];
  for (let channel = 0; channel < 4; channel += 1)
  {
    const top = data[idx00 + channel] * (1 - fx) + data[idx10 + channel] * fx;
    const bottom = data[idx01 + channel] * (1 - fx) + data[idx11 + channel] * fx;
    out[channel] = Math.round(top * (1 - fy) + bottom * fy);
  }
  return out;
}

function warpQuadToCanvas(sourceCanvas: HTMLCanvasElement, quad: Point[])
{
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx)
  {
    throw new Error("Could not create source image context");
  }

  const srcImage = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const srcData = srcImage.data;
  const metrics = quadMetrics(quad);
  const outHeight = clamp(Math.round(Math.max(metrics.height, 320)), 320, 1400);
  const outWidth = clamp(Math.round(outHeight * CARD_ASPECT), 220, 1005);

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx)
  {
    throw new Error("Could not create warp canvas context");
  }

  const dstPts = [
    { x: 0, y: 0 },
    { x: outWidth - 1, y: 0 },
    { x: outWidth - 1, y: outHeight - 1 },
    { x: 0, y: outHeight - 1 },
  ];
  const homography = computeHomography(dstPts, quad);
  const outImage = ctx.createImageData(outWidth, outHeight);
  const out = outImage.data;

  for (let y = 0; y < outHeight; y += 1)
  {
    for (let x = 0; x < outWidth; x += 1)
    {
      const srcPoint = applyHomography(homography, x, y);
      const [r, g, b, a] = sampleRgba(srcData, sourceCanvas.width, sourceCanvas.height, srcPoint.x, srcPoint.y);
      const idx = (y * outWidth + x) * 4;
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = a;
    }
  }

  ctx.putImageData(outImage, 0, 0);
  return canvas;
}

async function evaluateRotationCandidate(
  originalCanvas: HTMLCanvasElement,
  originalClick: Point,
  angleDeg: number,
  statusLabel: string
): Promise<RotationCandidate>
{
  const { canvas: workingCanvas, scale } = resizeCanvas(originalCanvas, ROTATION_ANALYSIS_LONG_SIDE);
  const workingClick = {
    x: originalClick.x * scale,
    y: originalClick.y * scale,
  };

  const rotatedWorking = rotateCanvas(workingCanvas, angleDeg);
  const rotatedWorkingClick = rotatePoint(
    workingClick,
    workingCanvas.width,
    workingCanvas.height,
    rotatedWorking.outWidth,
    rotatedWorking.outHeight,
    angleDeg
  );
  const rotatedWorkingImageData = rotatedWorking.ctx.getImageData(0, 0, rotatedWorking.outWidth, rotatedWorking.outHeight);
  const stats = buildRotatedStats(rotatedWorkingImageData);
  const broadRect = broadSearchRect(stats, rotatedWorkingClick.x, rotatedWorkingClick.y);
  const bestRect = refineRectAroundSeed(stats, rotatedWorkingClick.x, rotatedWorkingClick.y, broadRect);
  const bestQuad = refineQuadAroundRect(stats, rotatedWorkingClick, bestRect);

  const rotatedOriginal = rotateCanvas(originalCanvas, angleDeg);
  const scaleX = rotatedOriginal.outWidth / rotatedWorking.outWidth;
  const scaleY = rotatedOriginal.outHeight / rotatedWorking.outHeight;
  const originalQuad = bestQuad.map((point) => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  }));

  const candidateCanvas = warpQuadToCanvas(rotatedOriginal.canvas, originalQuad);
  const portraitCanvas = enhanceCandidateCanvas(candidateCanvas);

  const originalCorners = bestQuad.map((corner) =>
    inverseRotatePoint(
      corner,
      workingCanvas.width,
      workingCanvas.height,
      rotatedWorking.outWidth,
      rotatedWorking.outHeight,
      angleDeg
    )
  );

  const roiDebugCanvas = document.createElement("canvas");
  roiDebugCanvas.width = workingCanvas.width;
  roiDebugCanvas.height = workingCanvas.height;
  const roiDebugCtx = roiDebugCanvas.getContext("2d");
  if (!roiDebugCtx)
  {
    throw new Error("Could not create ROI debug canvas context");
  }

  roiDebugCtx.drawImage(workingCanvas, 0, 0);
  roiDebugCtx.strokeStyle = "#00ff99";
  roiDebugCtx.lineWidth = Math.max(2, Math.round(workingCanvas.width / 120));
  drawPolygon(roiDebugCtx, originalCorners);
  roiDebugCtx.stroke();

  roiDebugCtx.fillStyle = "#ff3366";
  roiDebugCtx.beginPath();
  roiDebugCtx.arc(workingClick.x, workingClick.y, Math.max(4, Math.round(workingCanvas.width / 60)), 0, Math.PI * 2);
  roiDebugCtx.fill();

  const nameBandCanvas = extractBandCanvas(
    portraitCanvas,
    { left: 0.075, top: 0.035, width: 0.70, height: 0.10 },
    1400
  );
  const manaBandCanvas = extractBandCanvas(
    portraitCanvas,
    { left: 0.73, top: 0.03, width: 0.20, height: 0.115 },
    820
  );
  const typeBandCanvas = extractBandCanvas(
    portraitCanvas,
    { left: 0.075, top: 0.60, width: 0.78, height: 0.09 },
    1400
  );

  const [roiDebugUrl, candidateUrl, nameBandUrl, manaBandUrl, typeBandUrl] = await Promise.all([
    canvasToObjectUrl(roiDebugCanvas, "image/jpeg", 0.9),
    canvasToObjectUrl(portraitCanvas, "image/png"),
    canvasToObjectUrl(nameBandCanvas, "image/png"),
    canvasToObjectUrl(manaBandCanvas, "image/png"),
    canvasToObjectUrl(typeBandCanvas, "image/png"),
  ]);

  const bestScore = evaluateQuadScore(stats, bestQuad, quadCenter(bestQuad), rotatedWorkingClick);

  return {
    angleDeg,
    rect: bestRect,
    quad: bestQuad,
    roiDebugUrl,
    candidateUrl,
    nameBandUrl,
    manaBandUrl,
    typeBandUrl,
    statusText: statusLabel,
    score: bestScore,
  };
}

export async function refineCardCrop(
  roiImageData: ImageData,
  localClickX: number,
  localClickY: number
): Promise<RefinedCardCropResult>
{
  const { canvas: roiCanvas } = createCanvasFromImageData(roiImageData);
  const { canvas: workingCanvas, ctx: workingCtx, scale } = resizeCanvas(roiCanvas, ROTATION_ANALYSIS_LONG_SIDE);
  const workingImageData = workingCtx.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
  const workingClickX = clamp(Math.round(localClickX * scale), 0, workingCanvas.width - 1);
  const workingClickY = clamp(Math.round(localClickY * scale), 0, workingCanvas.height - 1);
  const dominant = estimateDominantLineAngle(workingImageData, workingClickX, workingClickY);
  const baseAngleDeg = (dominant.angleRad * 180) / Math.PI;

  const angleCandidates = dominant.confidence > 0.08
    ? [
        baseAngleDeg - 10,
        baseAngleDeg - 5,
        baseAngleDeg,
        baseAngleDeg + 5,
        baseAngleDeg + 10,
        baseAngleDeg + 90 - 8,
        baseAngleDeg + 90,
        baseAngleDeg + 90 + 8,
        0,
        90,
      ]
    : [0, 90, baseAngleDeg, baseAngleDeg + 90];

  const uniqueAngles = Array.from(
    new Set(angleCandidates.map((angle) => Math.round(angle)))
  );

  const candidates: RotationCandidate[] = [];
  for (const angleDeg of uniqueAngles)
  {
    const candidate = await evaluateRotationCandidate(
      roiCanvas,
      { x: localClickX, y: localClickY },
      angleDeg,
      dominant.confidence > 0.12
        ? `Perspective-corrected card candidate at ${Math.round((((angleDeg % 180) + 180) % 180))}°`
        : "Perspective-corrected card candidate"
    );
    candidates.push(candidate);
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return {
    roiDebugUrl: best.roiDebugUrl,
    candidateUrl: best.candidateUrl,
    nameBandUrl: best.nameBandUrl,
    manaBandUrl: best.manaBandUrl,
    typeBandUrl: best.typeBandUrl,
    statusText: best.statusText,
  };
}
