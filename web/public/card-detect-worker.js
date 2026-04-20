let openCvPromise = null;

function stripThenable(cvModule) {
  if (!cvModule || typeof cvModule.then !== "function") {
    return cvModule;
  }

  try {
    delete cvModule.then;
  } catch {
    try {
      cvModule.then = undefined;
    } catch {
    }
  }

  return cvModule;
}

function resolveCvModule(rawCv) {
  const cvModule = stripThenable(rawCv || self.cv);

  if (!cvModule || !cvModule.Mat) {
    throw new Error("OpenCV worker initialized without cv.Mat.");
  }

  self.cv = cvModule;
  return cvModule;
}

function loadOpenCv() {
  if (self.cv && self.cv.Mat) {
    return Promise.resolve(self.cv);
  }

  if (openCvPromise) {
    return openCvPromise;
  }

  openCvPromise = (async () => {
    try {
      if (!self.cv) {
        importScripts("/vendor/opencv.js");
      }

      if (!self.cv) {
        throw new Error("OpenCV worker script loaded but cv is unavailable.");
      }

      if (self.cv.Mat) {
        return resolveCvModule(self.cv);
      }

      if (typeof self.cv.then === "function") {
        return await new Promise((resolve, reject) => {
          try {
            self.cv.then((readyCv) => {
              try {
                resolve(resolveCvModule(readyCv));
              } catch (error) {
                reject(error);
              }
            });
          } catch (error) {
            reject(error);
          }
        });
      }

      return resolveCvModule(self.cv);
    } catch (error) {
      openCvPromise = null;
      throw error;
    }
  })();

  return openCvPromise;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonCenter(points) {
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.000001) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointNearRect(point, rect, padding = 0) {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  );
}

function orderQuadPoints(points) {
  const center = polygonCenter(points);
  const orderedByAngle = [...points].sort((a, b) => {
    const angleA = Math.atan2(a.y - center.y, a.x - center.x);
    const angleB = Math.atan2(b.y - center.y, b.x - center.x);
    return angleA - angleB;
  });
  const topLeftIndex = orderedByAngle.reduce((bestIndex, point, index, allPoints) => {
    const bestPoint = allPoints[bestIndex];
    const pointScore = point.y * 2 + point.x;
    const bestScore = bestPoint.y * 2 + bestPoint.x;
    return pointScore < bestScore ? index : bestIndex;
  }, 0);

  let ordered = [
    ...orderedByAngle.slice(topLeftIndex),
    ...orderedByAngle.slice(0, topLeftIndex),
  ];

  if (ordered[1].x < ordered[3].x) {
    ordered = [ordered[0], ordered[3], ordered[2], ordered[1]];
  }

  return ordered;
}

function matToPoints(mat) {
  const points = [];
  const data = mat.data32S;

  for (let index = 0; index < data.length; index += 2) {
    points.push({ x: data[index], y: data[index + 1] });
  }

  return points;
}

function getQuadMetrics(points) {
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  const top = distance(topLeft, topRight);
  const right = distance(topRight, bottomRight);
  const bottom = distance(bottomRight, bottomLeft);
  const left = distance(bottomLeft, topLeft);

  const width = Math.max(top, bottom);
  const height = Math.max(left, right);
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));

  return { top, right, bottom, left, width, height, ratio, area: width * height };
}

function polygonArea(points) {
  let total = 0;

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const next = points[(i + 1) % points.length];
    total += point.x * next.y - next.x * point.y;
  }

  return Math.abs(total) / 2;
}

function distancePointToSegment(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const lengthSq = abx * abx + aby * aby;

  if (lengthSq <= 1e-6) {
    return Math.hypot(apx, apy);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSq));
  const projX = a.x + abx * t;
  const projY = a.y + aby * t;
  return Math.hypot(point.x - projX, point.y - projY);
}

function getQuadClickMetrics(quad, localClick) {
  const metrics = getQuadMetrics(quad);
  const containsClick = pointInPolygon(localClick, quad);
  const center = polygonCenter(quad);
  const clickDistance = distance(localClick, center);
  const clickEdgeDistances = [
    distancePointToSegment(localClick, quad[0], quad[1]),
    distancePointToSegment(localClick, quad[1], quad[2]),
    distancePointToSegment(localClick, quad[2], quad[3]),
    distancePointToSegment(localClick, quad[3], quad[0]),
  ];
  const clickMargin =
    Math.min(...clickEdgeDistances) / Math.max(1, Math.min(metrics.width, metrics.height));

  return {
    metrics,
    containsClick,
    clickDistance,
    clickMargin,
  };
}

function normalizeLineAngle(angle) {
  let normalized = angle;

  while (normalized < 0) {
    normalized += Math.PI;
  }

  while (normalized >= Math.PI) {
    normalized -= Math.PI;
  }

  return normalized;
}

function angleDifference(a, b) {
  const delta = Math.abs(normalizeLineAngle(a) - normalizeLineAngle(b));
  return delta > Math.PI / 2 ? Math.PI - delta : delta;
}

function detectLineSegments(cv, mask) {
  const lines = new cv.Mat();
  const segments = [];

  try {
    const minSide = Math.max(16, Math.min(mask.cols, mask.rows));
    cv.HoughLinesP(
      mask,
      lines,
      1,
      Math.PI / 180,
      Math.max(16, Math.round(minSide * 0.06)),
      Math.max(18, Math.round(minSide * 0.12)),
      Math.max(10, Math.round(minSide * 0.035))
    );

    const data = lines.data32S || [];
    for (let index = 0; index + 3 < data.length; index += 4) {
      const x1 = data[index];
      const y1 = data[index + 1];
      const x2 = data[index + 2];
      const y2 = data[index + 3];
      const length = Math.hypot(x2 - x1, y2 - y1);

      if (length < 10) continue;

      segments.push({
        x1,
        y1,
        x2,
        y2,
        length,
        angle: normalizeLineAngle(Math.atan2(y2 - y1, x2 - x1)),
      });
    }

    return segments;
  } finally {
    lines.delete();
  }
}

function scoreQuadLineSupport(quad, lineSegments) {
  if (lineSegments.length === 0) {
    return 0;
  }

  const edgePairs = [
    [quad[0], quad[1]],
    [quad[1], quad[2]],
    [quad[2], quad[3]],
    [quad[3], quad[0]],
  ];

  let totalSupport = 0;

  for (const [start, end] of edgePairs) {
    const edgeLength = Math.max(1, distance(start, end));
    const edgeAngle = normalizeLineAngle(Math.atan2(end.y - start.y, end.x - start.x));
    const distanceTolerance = Math.max(3, edgeLength * 0.08);
    let bestSupport = 0;

    for (const segment of lineSegments) {
      const angularDistance = angleDifference(edgeAngle, segment.angle);
      if (angularDistance > 0.2) {
        continue;
      }

      const midpoint = {
        x: (segment.x1 + segment.x2) / 2,
        y: (segment.y1 + segment.y2) / 2,
      };
      const offset = distancePointToSegment(midpoint, start, end);
      if (offset > distanceTolerance) {
        continue;
      }

      const distanceScore = 1 - offset / distanceTolerance;
      const angleScore = 1 - angularDistance / 0.2;
      const coverageScore = Math.min(1, segment.length / edgeLength);
      const support = distanceScore * angleScore * coverageScore;

      if (support > bestSupport) {
        bestSupport = support;
      }
    }

    totalSupport += bestSupport;
  }

  return totalSupport / edgePairs.length;
}

function tryApproximateQuadFromShape(cv, shape) {
  const perimeter = cv.arcLength(shape, true);
  const epsilonRatios = [0.012, 0.018, 0.024, 0.03, 0.038, 0.05, 0.065];
  const candidates = [];

  for (const epsilonRatio of epsilonRatios) {
    const approx = new cv.Mat();

    try {
      cv.approxPolyDP(shape, approx, epsilonRatio * perimeter, true);

      if (approx.rows !== 4) continue;
      if (!cv.isContourConvex(approx)) continue;

      candidates.push(orderQuadPoints(matToPoints(approx)));
    } finally {
      approx.delete();
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  let bestQuad = null;
  let bestScore = -Infinity;

  for (const quad of candidates) {
    const metrics = getQuadMetrics(quad);
    if (!Number.isFinite(metrics.ratio)) {
      continue;
    }

    const fillRatio = polygonArea(quad) / Math.max(1, metrics.area);
    const parallelPenalty =
      Math.abs(metrics.top - metrics.bottom) / Math.max(1, Math.max(metrics.top, metrics.bottom)) +
      Math.abs(metrics.left - metrics.right) / Math.max(1, Math.max(metrics.left, metrics.right));
    const score =
      polygonArea(quad) * 0.002 -
      Math.abs(metrics.ratio - (88 / 63)) * 12 -
      Math.abs(fillRatio - 0.92) * 8 -
      parallelPenalty * 4;

    if (score > bestScore) {
      bestScore = score;
      bestQuad = quad;
    }
  }

  return bestQuad;
}

function approximateMinAreaRectQuad(cv, contour) {
  let rect;

  try {
    rect = cv.minAreaRect(contour);
  } catch {
    return null;
  }

  if (!rect?.center || !rect?.size) {
    return null;
  }

  const width = Number(rect.size.width);
  const height = Number(rect.size.height);
  const centerX = Number(rect.center.x);
  const centerY = Number(rect.center.y);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    width < 4 ||
    height < 4
  ) {
    return null;
  }

  const angle = (Number(rect.angle) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const alongWidth = { x: cos * halfWidth, y: sin * halfWidth };
  const alongHeight = { x: -sin * halfHeight, y: cos * halfHeight };
  const rawQuad = [
    {
      x: centerX - alongWidth.x - alongHeight.x,
      y: centerY - alongWidth.y - alongHeight.y,
    },
    {
      x: centerX + alongWidth.x - alongHeight.x,
      y: centerY + alongWidth.y - alongHeight.y,
    },
    {
      x: centerX + alongWidth.x + alongHeight.x,
      y: centerY + alongWidth.y + alongHeight.y,
    },
    {
      x: centerX - alongWidth.x + alongHeight.x,
      y: centerY - alongWidth.y + alongHeight.y,
    },
  ];
  const ordered = orderQuadPoints(rawQuad);
  const metrics = getQuadMetrics(ordered);

  if (metrics.ratio < 1.05 || metrics.ratio > 1.82) {
    return null;
  }

  return ordered;
}

function approximateContourQuad(cv, contour) {
  const candidates = [];
  const direct = tryApproximateQuadFromShape(cv, contour);
  if (direct) {
    candidates.push(direct);
  }

  const hull = new cv.Mat();

  try {
    cv.convexHull(contour, hull, true, true);
    const hullApproximation = tryApproximateQuadFromShape(cv, hull);
    if (hullApproximation) {
      candidates.push(hullApproximation);
    }

    const hullMinAreaRect = approximateMinAreaRectQuad(cv, hull);
    if (hullMinAreaRect) {
      candidates.push(hullMinAreaRect);
    }
  } finally {
    hull.delete();
  }

  const contourMinAreaRect = approximateMinAreaRectQuad(cv, contour);
  if (contourMinAreaRect) {
    candidates.push(contourMinAreaRect);
  }

  if (candidates.length === 0) {
    return null;
  }

  let bestQuad = null;
  let bestScore = -Infinity;

  for (const quad of candidates) {
    const metrics = getQuadMetrics(quad);
    if (!Number.isFinite(metrics.ratio)) {
      continue;
    }

    const fillRatio = polygonArea(quad) / Math.max(1, metrics.area);
    const score =
      polygonArea(quad) * 0.002 -
      Math.abs(metrics.ratio - (88 / 63)) * 12 -
      Math.abs(fillRatio - 0.92) * 8;

    if (score > bestScore) {
      bestScore = score;
      bestQuad = quad;
    }
  }

  return bestQuad;
}

function scoreQuadCandidate(
  quad,
  localClick,
  rawArea,
  imageArea,
  idealRatio,
  lineSupport,
  passWeight = 1
) {
  const clickMetrics = getQuadClickMetrics(quad, localClick);
  const metrics = clickMetrics.metrics;
  if (!Number.isFinite(metrics.ratio)) {
    return -Infinity;
  }

  const polygon = polygonArea(quad);
  const fillRatio = polygon / Math.max(1, metrics.area);
  if (fillRatio < 0.72 || fillRatio > 1.12) {
    return -Infinity;
  }

  const containsClick = clickMetrics.containsClick;
  const clickDistance = clickMetrics.clickDistance;
  const areaRatio = polygon / Math.max(1, imageArea);
  const clickMargin = clickMetrics.clickMargin;
  const marginBonus = clickMargin >= 0.12
    ? 110 * Math.min(1, (clickMargin - 0.12) / 0.18)
    : -180 * Math.min(1, (0.12 - clickMargin) / 0.12);
  const containsBonus = containsClick ? 220 : 0;
  const outsidePenalty = containsClick ? 0 : 180;
  const areaPenalty = areaRatio < 0.012
    ? (0.012 - areaRatio) * 18000
    : areaRatio > 0.34
      ? (areaRatio - 0.34) * 9000
      : 0;
  const ratioPenalty = Math.abs(metrics.ratio - idealRatio) * 260;
  const fillPenalty = Math.abs(fillRatio - 0.92) * 180;
  const parallelPenalty =
    Math.abs(metrics.top - metrics.bottom) * 0.35 +
    Math.abs(metrics.left - metrics.right) * 0.35;

  const score =
    polygon * 0.18 +
    rawArea * 0.04 +
    420 +
    containsBonus +
    lineSupport * 180 +
    marginBonus -
    clickDistance * 0.9 -
    ratioPenalty -
    fillPenalty -
    parallelPenalty -
    outsidePenalty -
    areaPenalty;

  return score * passWeight;
}

function scoreLegacyQuadCandidate(
  quad,
  localClick,
  rawArea,
  idealRatio
) {
  const clickMetrics = getQuadClickMetrics(quad, localClick);
  const metrics = clickMetrics.metrics;
  if (!Number.isFinite(metrics.ratio)) {
    return -Infinity;
  }
  if (metrics.ratio < 1.15 || metrics.ratio > 1.7) {
    return -Infinity;
  }

  const clickDistance = clickMetrics.clickDistance;
  const containsClick = clickMetrics.containsClick;

  let score = rawArea;
  if (containsClick) {
    score *= 3.8;
  }
  score *= 1 / (1 + clickDistance * 0.06);
  score *= 1 / (1 + Math.abs(metrics.ratio - idealRatio) * 5);
  return score;
}

function refineQuadCornersSubPix(cv, gray, quad) {
  const corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad[0].x, quad[0].y,
    quad[1].x, quad[1].y,
    quad[2].x, quad[2].y,
    quad[3].x, quad[3].y,
  ]);
  const criteria = new cv.TermCriteria(
    cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
    24,
    0.03
  );

  try {
    cv.cornerSubPix(
      gray,
      corners,
      new cv.Size(7, 7),
      new cv.Size(-1, -1),
      criteria
    );

    const data = corners.data32F;
    if (!data || data.length < 8) {
      return quad;
    }

    const refined = orderQuadPoints([
      { x: data[0], y: data[1] },
      { x: data[2], y: data[3] },
      { x: data[4], y: data[5] },
      { x: data[6], y: data[7] },
    ]);
    const metrics = getQuadMetrics(refined);
    const polygon = polygonArea(refined);

    if (metrics.ratio < 1.15 || metrics.ratio > 1.7) {
      return quad;
    }

    if (polygon < 100) {
      return quad;
    }

    const maxCornerShift = Math.max(18, Math.min(metrics.width, metrics.height) * 0.18);
    for (let index = 0; index < 4; index += 1) {
      if (distance(refined[index], quad[index]) > maxCornerShift) {
        return quad;
      }
    }

    return refined;
  } catch {
    return quad;
  } finally {
    corners.delete();
  }
}

async function canvasToBlob(canvas, type = "image/jpeg", quality = 0.9) {
  if (typeof canvas.convertToBlob === "function") {
    return await canvas.convertToBlob({ type, quality });
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Failed to create image blob."));
    }, type, quality);
  });
}

function createSourceCanvas(frame) {
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create source canvas context.");
  }

  ctx.putImageData(frame.imageData, 0, 0);
  return { canvas, ctx };
}

function matToImageData(mat) {
  if (mat.type() !== self.cv.CV_8UC4) {
    throw new Error("Unexpected Mat format from OpenCV worker.");
  }

  return new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows);
}

function drawQuad(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function yieldToWorker() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function rotateCanvasQuarterTurns(source, quarterTurns) {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) {
    return source;
  }

  const swapSides = turns % 2 === 1;
  const out = new OffscreenCanvas(
    swapSides ? source.height : source.width,
    swapSides ? source.width : source.height
  );
  const ctx = out.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create rotated canvas context.");
  }

  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((Math.PI / 2) * turns);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

function cropCanvasRegion(source, x, y, width, height) {
  const sx = Math.max(0, Math.min(source.width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(source.height - 1, Math.round(y)));
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(width)));
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(height)));
  const out = new OffscreenCanvas(sw, sh);
  const ctx = out.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create band crop canvas context.");
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

function analyzeCanvasRegion(source, region) {
  const x = Math.max(0, Math.min(source.width - 1, Math.round(source.width * region.left)));
  const y = Math.max(0, Math.min(source.height - 1, Math.round(source.height * region.top)));
  const width = Math.max(1, Math.min(source.width - x, Math.round(source.width * region.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.round(source.height * region.height)));
  const sample = cropCanvasRegion(source, x, y, width, height);
  const ctx = sample.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create sample analysis context.");
  }

  const imageData = ctx.getImageData(0, 0, sample.width, sample.height);
  const { data } = imageData;
  const pixelCount = Math.max(1, sample.width * sample.height);
  const gray = new Float32Array(pixelCount);
  let total = 0;
  let midTonePixels = 0;
  let darkPixels = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[p] = value;
    total += value;

    if (value >= 55 && value <= 235) {
      midTonePixels += 1;
    }

    if (value <= 30) {
      darkPixels += 1;
    }
  }

  const mean = total / pixelCount;
  let variance = 0;
  let edgeEnergy = 0;
  const rowActivity = new Float32Array(sample.height);

  for (let row = 0; row < sample.height; row += 1) {
    for (let col = 0; col < sample.width; col += 1) {
      const index = row * sample.width + col;
      const value = gray[index];
      variance += (value - mean) * (value - mean);

      if (col > 0) {
        edgeEnergy += Math.abs(value - gray[index - 1]);
      }

      if (row > 0) {
        edgeEnergy += Math.abs(value - gray[index - sample.width]);
      }
    }
  }

  const stdDev = Math.sqrt(variance / pixelCount);
  const textThreshold = Math.max(48, Math.min(168, mean - Math.min(26, stdDev * 0.45)));
  let activeRows = 0;
  let activeClusters = 0;
  let activeWeight = 0;
  let weightedRowSum = 0;
  let maxRowActivity = 0;
  let previousActive = false;

  for (let row = 0; row < sample.height; row += 1) {
    let darkPixels = 0;

    for (let col = 0; col < sample.width; col += 1) {
      const index = row * sample.width + col;
      if (gray[index] <= textThreshold) {
        darkPixels += 1;
      }
    }

    const activity = darkPixels / Math.max(1, sample.width);
    rowActivity[row] = activity;
    maxRowActivity = Math.max(maxRowActivity, activity);
    const isActive = activity >= 0.065;

    if (isActive) {
      activeRows += 1;
      activeWeight += activity;
      weightedRowSum += row * activity;
      if (!previousActive) {
        activeClusters += 1;
      }
    }

    previousActive = isActive;
  }

  const edgeRows = Math.max(1, Math.round(sample.height * 0.16));
  let edgeActivity = 0;
  for (let row = 0; row < edgeRows; row += 1) {
    edgeActivity += rowActivity[row];
  }
  for (let row = sample.height - edgeRows; row < sample.height; row += 1) {
    edgeActivity += rowActivity[row];
  }
  edgeActivity /= Math.max(1, edgeRows * 2);

  const activeRowRatio = activeRows / Math.max(1, sample.height);
  const activeRowCenter = activeWeight > 0
    ? (weightedRowSum / activeWeight) / Math.max(1, sample.height - 1)
    : 0.5;

  return {
    mean,
    stdDev,
    normalizedEdgeEnergy: edgeEnergy / pixelCount,
    midToneRatio: midTonePixels / pixelCount,
    darkRatio: darkPixels / pixelCount,
    activeRowRatio,
    activeClusters,
    activeRowCenter,
    edgeActivity,
    maxRowActivity,
  };
}

function scoreTitleBandRegion(source, region) {
  const metrics = analyzeCanvasRegion(source, region);
  const aboveHeight = Math.max(0.012, region.height * 0.28);
  const belowHeight = Math.max(0.012, region.height * 0.34);
  const aboveRegion = {
    left: region.left,
    top: Math.max(0, region.top - aboveHeight),
    width: region.width,
    height: Math.min(aboveHeight, region.top),
  };
  const belowRegion = {
    left: region.left,
    top: Math.min(0.98, region.top + region.height),
    width: region.width,
    height: Math.min(belowHeight, Math.max(0.012, 1 - (region.top + region.height))),
  };
  const aboveMetrics = analyzeCanvasRegion(source, aboveRegion);
  const belowMetrics = analyzeCanvasRegion(source, belowRegion);
  const brightnessScore = 1 - Math.min(1, Math.abs(metrics.mean - 182) / 182);
  const contrastScore = Math.min(1, metrics.stdDev / 52);
  const edgeScore = Math.min(1, metrics.normalizedEdgeEnergy / 18);
  const boundaryScore = Math.min(
    1,
    (Math.abs(metrics.mean - aboveMetrics.mean) + Math.abs(metrics.mean - belowMetrics.mean)) / 92
  );
  const center = region.top + region.height * 0.5;
  const centerBias = 1 - Math.min(1, Math.abs(center - 0.068) / 0.08);
  const heightBias = 1 - Math.min(1, Math.abs(region.height - 0.066) / 0.045);
  const darkPenalty = Math.max(0, metrics.darkRatio - 0.2) * 2.3;
  const flatPenalty = Math.max(0, 0.12 - metrics.midToneRatio) * 2.1;
  const textClusterScore = Math.max(0, 1 - Math.abs(metrics.activeClusters - 1) * 0.55);
  const textRowRatioScore = 1 - Math.min(1, Math.abs(metrics.activeRowRatio - 0.24) / 0.28);
  const textCenterScore = 1 - Math.min(1, Math.abs(metrics.activeRowCenter - 0.5) / 0.24);
  const edgeCleanScore = 1 - Math.min(1, metrics.edgeActivity / 0.18);
  const rowPeakScore = Math.min(1, metrics.maxRowActivity / 0.42);

  return (
    brightnessScore * 0.1 +
    contrastScore * 0.17 +
    edgeScore * 0.16 +
    boundaryScore * 0.14 +
    metrics.midToneRatio * 0.08 +
    centerBias * 0.08 +
    heightBias * 0.06 +
    textClusterScore * 0.12 +
    textRowRatioScore * 0.12 +
    textCenterScore * 0.1 +
    edgeCleanScore * 0.08 +
    rowPeakScore * 0.06 -
    darkPenalty -
    flatPenalty
  );
}

function expandTitleBandRegion(region) {
  const padLeft = Math.max(0.012, region.width * 0.025);
  const padRight = Math.max(0.018, region.width * 0.04);
  const padTop = Math.max(0.008, region.height * 0.22);
  const padBottom = Math.max(0.02, region.height * 0.65);
  const left = Math.max(0, region.left - padLeft);
  const top = Math.max(0, region.top - padTop);
  const right = Math.min(1, region.left + region.width + padRight);
  const bottom = Math.min(1, region.top + region.height + padBottom);

  return {
    left,
    top,
    width: Math.max(0.1, right - left),
    height: Math.max(0.04, bottom - top),
  };
}

function detectTitleBandRegion(source) {
  const left = 0.038;
  const width = 0.89;
  let bestRegion = {
    left,
    top: 0.022,
    width,
    height: 0.062,
  };
  let bestScore = -Infinity;

  for (const height of [0.042, 0.05, 0.06, 0.072, 0.084, 0.096]) {
    for (let top = 0.006; top <= 0.132; top += 0.006) {
      const region = {
        left,
        top,
        width,
        height,
      };
      const score = scoreTitleBandRegion(source, region);

      if (score > bestScore) {
        bestScore = score;
        bestRegion = region;
      }
    }
  }

  return {
    region: bestRegion,
    score: bestScore,
  };
}

function scoreCardBodyOrientation(source) {
  const upperTextRegion = {
    left: 0.08,
    top: 0.18,
    width: 0.84,
    height: 0.16,
  };
  const lowerTextRegion = {
    left: 0.08,
    top: 0.57,
    width: 0.84,
    height: 0.24,
  };
  const upper = analyzeCanvasRegion(source, upperTextRegion);
  const lower = analyzeCanvasRegion(source, lowerTextRegion);

  const summarizeText = (metrics) =>
    metrics.activeRowRatio * 1.15 +
    Math.min(1, metrics.activeClusters / 3) * 0.7 +
    metrics.maxRowActivity * 0.55 +
    (1 - Math.min(1, Math.abs(metrics.activeRowCenter - 0.5) / 0.28)) * 0.35;

  return summarizeText(lower) - summarizeText(upper);
}

function chooseOrientedCardAndTitleBand(source) {
  let bestCanvas = source;
  let bestBandCanvas = cropCanvasRegion(
    source,
    source.width * 0.03,
    source.height * 0.016,
    source.width * 0.92,
    source.height * 0.085
  );
  let bestScore = -Infinity;
  const candidates = [];
  const orientationCandidates = [0, 1, 2, 3];

  for (const quarterTurns of orientationCandidates) {
    const oriented = rotateCanvasQuarterTurns(source, quarterTurns);
    const detection = detectTitleBandRegion(oriented);
    const region = expandTitleBandRegion(detection.region);
    const bandCanvas = cropCanvasRegion(
      oriented,
      oriented.width * region.left,
      oriented.height * region.top,
      oriented.width * region.width,
      oriented.height * region.height
    );
    const orientationScore = scoreCardBodyOrientation(oriented);
    const quarterTurnPenalty = quarterTurns % 2 === 1 ? 0.26 : 0;
    const score =
      detection.score +
      orientationScore * 0.28 -
      (quarterTurns === 2 ? 0.18 : 0) -
      quarterTurnPenalty;

    candidates.push({
      quarterTurns,
      canvas: oriented,
      bandCanvas,
      score,
    });

    if (score > bestScore) {
      bestScore = score;
      bestCanvas = oriented;
      bestBandCanvas = bandCanvas;
    }
  }

  const uprightCandidate = candidates.find((candidate) => candidate.quarterTurns === 0);
  const clockwiseCandidate = candidates.find((candidate) => candidate.quarterTurns === 1);
  const flippedCandidate = candidates.find((candidate) => candidate.quarterTurns === 2);
  const counterClockwiseCandidate = candidates.find((candidate) => candidate.quarterTurns === 3);
  const bestQuarterTurnCandidate = [clockwiseCandidate, counterClockwiseCandidate]
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0];

  if (
    bestQuarterTurnCandidate &&
    uprightCandidate &&
    bestCanvas === bestQuarterTurnCandidate.canvas &&
    bestQuarterTurnCandidate.score < uprightCandidate.score + 0.52
  ) {
    bestCanvas = uprightCandidate.canvas;
    bestBandCanvas = uprightCandidate.bandCanvas;
  }

  if (
    flippedCandidate &&
    uprightCandidate &&
    bestCanvas === flippedCandidate.canvas &&
    flippedCandidate.score < uprightCandidate.score + 0.4
  ) {
    bestCanvas = uprightCandidate.canvas;
    bestBandCanvas = uprightCandidate.bandCanvas;
  }

  return {
    canvas: bestCanvas,
    bandCanvas: bestBandCanvas,
  };
}

async function detectAndRectifyCardInWorker(cv, frame, options) {
  const source = createSourceCanvas(frame);
  const analysisLongSide = options?.analysisLongSide ?? 640;
  const maxProcessingMs = options?.maxProcessingMs ?? 180;
  const analysisScale = Math.min(1, analysisLongSide / Math.max(frame.width, frame.height));
  const analysisWidth = Math.max(1, Math.round(frame.width * analysisScale));
  const analysisHeight = Math.max(1, Math.round(frame.height * analysisScale));

  const analysisCanvas = new OffscreenCanvas(analysisWidth, analysisHeight);
  const analysisCtx = analysisCanvas.getContext("2d");

  if (!analysisCtx) {
    throw new Error("Could not create analysis canvas context.");
  }

  analysisCtx.drawImage(source.canvas, 0, 0, analysisWidth, analysisHeight);
  const analysisImage = analysisCtx.getImageData(0, 0, analysisWidth, analysisHeight);

  const src = cv.matFromImageData(analysisImage);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();
  const blurred = new cv.Mat();
  const bilateral = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const variantMasks = [];
  let legacyEdges = null;
  let legacyMorph = null;

  let bestQuad = null;
  let bestScore = -Infinity;
  let consideredContours = 0;
  let quadCandidates = 0;
  let strictRatioRejects = 0;
  let strictFillRejects = 0;
  let clickRejects = 0;

  const localClick = {
    x: frame.clickX * analysisScale,
    y: frame.clickY * analysisScale,
  };
  const imageArea = analysisWidth * analysisHeight;
  const minArea = imageArea * 0.006;
  const maxArea = imageArea * 0.68;
  const idealRatio = 88 / 63;
  const deadline = performance.now() + maxProcessingMs;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, equalized);
    cv.GaussianBlur(equalized, blurred, new cv.Size(5, 5), 0);
    cv.bilateralFilter(equalized, bilateral, 7, 40, 40, cv.BORDER_DEFAULT);

    const cannyWide = new cv.Mat();
    const cannyWideClosed = new cv.Mat();
    cv.Canny(bilateral, cannyWide, 36, 118);
    cv.morphologyEx(cannyWide, cannyWideClosed, cv.MORPH_CLOSE, kernel);
    variantMasks.push({ mat: cannyWideClosed, passWeight: 1.0 });
    cannyWide.delete();

    const cannyTight = new cv.Mat();
    const cannyTightClosed = new cv.Mat();
    cv.Canny(equalized, cannyTight, 58, 168);
    cv.morphologyEx(cannyTight, cannyTightClosed, cv.MORPH_CLOSE, kernel);
    variantMasks.push({ mat: cannyTightClosed, passWeight: 1.08 });
    cannyTight.delete();

    const adaptive = new cv.Mat();
    const adaptiveClosed = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      adaptive,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      6
    );
    cv.morphologyEx(adaptive, adaptiveClosed, cv.MORPH_CLOSE, kernel);
    variantMasks.push({ mat: adaptiveClosed, passWeight: 1.14 });
    adaptive.delete();

    const otsu = new cv.Mat();
    const otsuClosed = new cv.Mat();
    cv.threshold(equalized, otsu, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    cv.morphologyEx(otsu, otsuClosed, cv.MORPH_CLOSE, kernel);
    variantMasks.push({ mat: otsuClosed, passWeight: 0.96 });
    otsu.delete();

    const gradient = new cv.Mat();
    const gradientThreshold = new cv.Mat();
    const gradientClosed = new cv.Mat();
    cv.morphologyEx(bilateral, gradient, cv.MORPH_GRADIENT, kernel);
    cv.threshold(gradient, gradientThreshold, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(gradientThreshold, gradientClosed, cv.MORPH_CLOSE, kernel);
    variantMasks.push({ mat: gradientClosed, passWeight: 1.05 });
    gradient.delete();
    gradientThreshold.delete();

    legacyEdges = new cv.Mat();
    legacyMorph = new cv.Mat();
    cv.Canny(blurred, legacyEdges, 60, 160);
    cv.morphologyEx(legacyEdges, legacyMorph, cv.MORPH_CLOSE, kernel);

    const considerContour = (contour, passWeight, lineSegments) => {
      consideredContours += 1;
      const rawArea = Math.abs(cv.contourArea(contour));
      if (rawArea < minArea || rawArea > maxArea) {
        return;
      }

      const bounds = cv.boundingRect(contour);
      const boundsRatio = Math.max(bounds.width, bounds.height) / Math.max(1, Math.min(bounds.width, bounds.height));
      const clickPadding = Math.max(10, Math.min(bounds.width, bounds.height) * 0.18);
      if (boundsRatio > 2.25 || !isPointNearRect(localClick, bounds, clickPadding)) {
        clickRejects += 1;
        return;
      }

      const quad = approximateContourQuad(cv, contour);
      if (!quad) {
        return;
      }
      quadCandidates += 1;

      const lineSupport = scoreQuadLineSupport(quad, lineSegments);
      const clickMetrics = getQuadClickMetrics(quad, localClick);
      const metrics = clickMetrics.metrics;
      if (!clickMetrics.containsClick && clickMetrics.clickMargin < 0.035) {
        clickRejects += 1;
        return;
      }

      if (metrics.ratio < 1.15 || metrics.ratio > 1.7) {
        strictRatioRejects += 1;
        return;
      }

      const fillRatio = polygonArea(quad) / Math.max(1, metrics.area);
      if (fillRatio < 0.72 || fillRatio > 1.12) {
        strictFillRejects += 1;
        return;
      }

      const score = scoreQuadCandidate(
        quad,
        localClick,
        rawArea,
        imageArea,
        idealRatio,
        lineSupport,
        passWeight
      );
      if (score > bestScore) {
        bestScore = score;
        bestQuad = quad;
      }
    };

    const collectCandidatesFromMask = async (mask, passWeight) => {
      const lineSource = mask.clone();
      const contourSource = mask.clone();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      try {
        const lineSegments = detectLineSegments(cv, lineSource);
        cv.findContours(contourSource, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        let lastYieldAt = performance.now();

        for (let i = 0; i < contours.size(); i += 1) {
          if (performance.now() >= deadline) {
            break;
          }

          const contour = contours.get(i);

          try {
            considerContour(contour, passWeight, lineSegments);
          } finally {
            contour.delete();
          }

          if ((i + 1) % 24 === 0 || performance.now() - lastYieldAt >= 14) {
            await yieldToWorker();
            lastYieldAt = performance.now();
          }
        }
      } finally {
        lineSource.delete();
        contourSource.delete();
        contours.delete();
        hierarchy.delete();
      }
    };

    for (const variant of variantMasks) {
      if (performance.now() >= deadline) {
        break;
      }

      await collectCandidatesFromMask(variant.mat, variant.passWeight);

      if (performance.now() >= deadline) {
        break;
      }

      await yieldToWorker();
    }

    if (!bestQuad && legacyMorph) {
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      const contourSource = legacyMorph.clone();
      const legacyMinArea = analysisWidth * analysisHeight * 0.014;

      try {
        cv.findContours(contourSource, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        for (let i = 0; i < contours.size(); i += 1) {
          const contour = contours.get(i);
          const approx = new cv.Mat();

          try {
            const perimeter = cv.arcLength(contour, true);
            cv.approxPolyDP(contour, approx, 0.03 * perimeter, true);

            if (approx.rows !== 4) continue;
            if (!cv.isContourConvex(approx)) continue;

            const rawArea = Math.abs(cv.contourArea(approx));
            if (rawArea < legacyMinArea) continue;

            const quad = orderQuadPoints(matToPoints(approx));
            quadCandidates += 1;
            if (!pointInPolygon(localClick, quad)) continue;
            const score = scoreLegacyQuadCandidate(
              quad,
              localClick,
              rawArea,
              idealRatio
            );

            if (score > bestScore) {
              bestScore = score;
              bestQuad = quad;
            }
          } finally {
            contour.delete();
            approx.delete();
          }
        }
      } finally {
        contourSource.delete();
        contours.delete();
        hierarchy.delete();
      }
    }

    if (!bestQuad) {
      throw new Error(
        `OpenCV card detection failed (contours: ${consideredContours}, quads: ${quadCandidates}, ratio rejects: ${strictRatioRejects}, fill rejects: ${strictFillRejects}, click rejects: ${clickRejects})`
      );
    }

    const detectedQuad = bestQuad;
    const refinedQuad = refineQuadCornersSubPix(cv, gray, detectedQuad);
    const scaleBack = 1 / analysisScale;
    const sourceQuad = refinedQuad.map((point) => ({
      x: point.x * scaleBack,
      y: point.y * scaleBack,
    }));

    const [topLeft, topRight, bottomRight, bottomLeft] = sourceQuad;
    const topWidth = distance(topLeft, topRight);
    const bottomWidth = distance(bottomLeft, bottomRight);
    const leftHeight = distance(topLeft, bottomLeft);
    const rightHeight = distance(topRight, bottomRight);

    const outputWidth = Math.max(1, Math.round(Math.max(topWidth, bottomWidth)));
    const outputHeight = Math.max(1, Math.round(Math.max(leftHeight, rightHeight)));
    const sourceLongSide = Math.max(outputWidth, outputHeight);
    const destinationHeight = Math.max(720, Math.min(1400, Math.round(sourceLongSide * 4.25)));
    const destinationWidth = Math.max(1, Math.round(destinationHeight * (63 / 88)));

    const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
      topLeft.x, topLeft.y,
      topRight.x, topRight.y,
      bottomRight.x, bottomRight.y,
      bottomLeft.x, bottomLeft.y,
    ]);

    const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      destinationWidth - 1, 0,
      destinationWidth - 1, destinationHeight - 1,
      0, destinationHeight - 1,
    ]);

    const transform = cv.getPerspectiveTransform(srcMat, dstMat);
    const warped = new cv.Mat();

    try {
      const originalMat = cv.matFromImageData(frame.imageData);

      try {
        cv.warpPerspective(
          originalMat,
          warped,
          transform,
          new cv.Size(destinationWidth, destinationHeight),
          cv.INTER_LINEAR,
          cv.BORDER_REPLICATE,
          new cv.Scalar()
        );
      } finally {
        originalMat.delete();
      }

      const rawCropCanvas = new OffscreenCanvas(destinationWidth, destinationHeight);
      const cropCtx = rawCropCanvas.getContext("2d");

      if (!cropCtx) {
        throw new Error("Could not create crop canvas context.");
      }

      cropCtx.putImageData(matToImageData(warped), 0, 0);
      const debugCanvas = new OffscreenCanvas(frame.width, frame.height);
      const debugCtx = debugCanvas.getContext("2d");

      if (!debugCtx) {
        throw new Error("Could not create detection debug canvas context.");
      }

      debugCtx.drawImage(source.canvas, 0, 0);
      debugCtx.strokeStyle = "#00ff99";
      debugCtx.lineWidth = Math.max(2, Math.round(frame.width / 180));
      drawQuad(debugCtx, sourceQuad);
      debugCtx.stroke();

      debugCtx.fillStyle = "#ff3366";
      debugCtx.beginPath();
      debugCtx.arc(frame.clickX, frame.clickY, Math.max(4, Math.round(frame.width / 90)), 0, Math.PI * 2);
      debugCtx.fill();

      const [cropBlob, debugBlob] = await Promise.all([
        canvasToBlob(rawCropCanvas),
        canvasToBlob(debugCanvas),
      ]);

      return {
        cropBlob,
        debugBlob,
      };
    } finally {
      srcMat.delete();
      dstMat.delete();
      transform.delete();
      warped.delete();
    }
  } finally {
    src.delete();
    gray.delete();
    equalized.delete();
    blurred.delete();
    bilateral.delete();
    if (legacyEdges) legacyEdges.delete();
    if (legacyMorph) legacyMorph.delete();
    for (const variant of variantMasks) {
      variant.mat.delete();
    }
    kernel.delete();
  }
}

self.onmessage = async (event) => {
  const message = event.data;

  if (!message || (message.type !== "detect" && message.type !== "warmup")) {
    return;
  }

  try {
    const cv = await loadOpenCv();

    if (message.type === "warmup") {
      self.postMessage({
        id: message.id,
        ok: true,
        warmed: true,
      });
      return;
    }

    const frame = {
      width: message.frame.width,
      height: message.frame.height,
      clickX: message.frame.clickX,
      clickY: message.frame.clickY,
      imageData: new ImageData(
        new Uint8ClampedArray(
          message.frame.pixels,
          message.frame.pixelOffset,
          message.frame.pixelLength
        ),
        message.frame.width,
        message.frame.height
      ),
    };
    const result = await detectAndRectifyCardInWorker(cv, frame, message.options);

    if (!result) {
      self.postMessage({
        id: message.id,
        ok: false,
        error: "OpenCV card detection failed",
      });
      return;
    }

      self.postMessage({
        id: message.id,
        ok: true,
        cropBlob: result.cropBlob,
        nameBandBlob: result.nameBandBlob,
        debugBlob: result.debugBlob,
      });
  } catch (error) {
    self.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
