import type { CapturedFrame, CardCropDebugResult, CardPoint } from "./types";

const CARD_ASPECT = 63 / 88;

function distance(a: CardPoint, b: CardPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonCenter(points: CardPoint[]) {
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function pointInPolygon(point: CardPoint, polygon: CardPoint[]) {
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

function orderQuadPoints(points: CardPoint[]): [CardPoint, CardPoint, CardPoint, CardPoint] {
  const sums = points.map((point) => point.x + point.y);
  const diffs = points.map((point) => point.y - point.x);

  const topLeft = points[sums.indexOf(Math.min(...sums))];
  const bottomRight = points[sums.indexOf(Math.max(...sums))];
  const topRight = points[diffs.indexOf(Math.min(...diffs))];
  const bottomLeft = points[diffs.indexOf(Math.max(...diffs))];

  return [topLeft, topRight, bottomRight, bottomLeft];
}

function matToPoints(mat: any): CardPoint[] {
  const points: CardPoint[] = [];
  const data = mat.data32S;

  for (let index = 0; index < data.length; index += 2) {
    points.push({ x: data[index], y: data[index + 1] });
  }

  return points;
}

function getQuadMetrics(points: [CardPoint, CardPoint, CardPoint, CardPoint]) {
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  const top = distance(topLeft, topRight);
  const right = distance(topRight, bottomRight);
  const bottom = distance(bottomRight, bottomLeft);
  const left = distance(bottomLeft, topLeft);

  const width = Math.max(top, bottom);
  const height = Math.max(left, right);
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));

  return { width, height, ratio, area: width * height };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Failed to create image blob."));
    }, "image/jpeg", 0.9);
  });
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await canvasToBlob(canvas);
  return URL.createObjectURL(blob);
}

function createSourceCanvas(frame: CapturedFrame) {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create source canvas context.");
  }

  ctx.putImageData(frame.imageData, 0, 0);
  return { canvas, ctx };
}

export async function detectAndRectifyCard(
  cv: any,
  frame: CapturedFrame,
  options?: {
    analysisLongSide?: number;
  }
): Promise<CardCropDebugResult | null> {
  const source = createSourceCanvas(frame);
  const analysisLongSide = options?.analysisLongSide ?? 420;
  const analysisScale = Math.min(1, analysisLongSide / Math.max(frame.width, frame.height));
  const analysisWidth = Math.max(1, Math.round(frame.width * analysisScale));
  const analysisHeight = Math.max(1, Math.round(frame.height * analysisScale));

  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = analysisWidth;
  analysisCanvas.height = analysisHeight;
  const analysisCtx = analysisCanvas.getContext("2d");

  if (!analysisCtx) {
    throw new Error("Could not create analysis canvas context.");
  }

  analysisCtx.drawImage(source.canvas, 0, 0, analysisWidth, analysisHeight);
  const analysisImage = analysisCtx.getImageData(0, 0, analysisWidth, analysisHeight);

  const src = cv.matFromImageData(analysisImage);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const morph = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));

  let bestQuad: [CardPoint, CardPoint, CardPoint, CardPoint] | null = null;
  let bestScore = -Infinity;

  const localClick = {
    x: frame.clickX * analysisScale,
    y: frame.clickY * analysisScale,
  };

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 60, 160);
    cv.morphologyEx(edges, morph, cv.MORPH_CLOSE, kernel);
    cv.findContours(morph, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = analysisWidth * analysisHeight * 0.014;
    const idealRatio = 88 / 63;

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const approx = new cv.Mat();

      try {
        const perimeter = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, 0.03 * perimeter, true);

        if (approx.rows !== 4) continue;
        if (!cv.isContourConvex(approx)) continue;

        const rawArea = Math.abs(cv.contourArea(approx));
        if (rawArea < minArea) continue;

        const quad = orderQuadPoints(matToPoints(approx));
        const metrics = getQuadMetrics(quad);
        if (!Number.isFinite(metrics.ratio)) continue;
        if (metrics.ratio < 1.15 || metrics.ratio > 1.7) continue;

        const center = polygonCenter(quad);
        const clickDistance = distance(localClick, center);
        const containsClick = pointInPolygon(localClick, quad);

        let score = rawArea;
        if (containsClick) score *= 3.8;
        score *= 1 / (1 + clickDistance * 0.06);
        score *= 1 / (1 + Math.abs(metrics.ratio - idealRatio) * 5);

        if (score > bestScore) {
          bestScore = score;
          bestQuad = quad;
        }
      } finally {
        contour.delete();
        approx.delete();
      }
    }

    if (!bestQuad) {
      return null;
    }

    const scaleBack = 1 / analysisScale;
    const sourceQuad = bestQuad.map((point) => ({
      x: point.x * scaleBack,
      y: point.y * scaleBack,
    })) as [CardPoint, CardPoint, CardPoint, CardPoint];

    const [topLeft, topRight, bottomRight, bottomLeft] = sourceQuad;
    const topWidth = distance(topLeft, topRight);
    const bottomWidth = distance(bottomLeft, bottomRight);
    const leftHeight = distance(topLeft, bottomLeft);
    const rightHeight = distance(topRight, bottomRight);

    const outputWidth = Math.max(1, Math.round(Math.max(topWidth, bottomWidth)));
    const outputHeight = Math.max(1, Math.round(Math.max(leftHeight, rightHeight)));
    const sourceLongSide = Math.max(outputWidth, outputHeight);
    const destinationHeight = Math.max(720, Math.min(1400, Math.round(sourceLongSide * 4.25)));
    const destinationWidth = Math.max(1, Math.round(destinationHeight * CARD_ASPECT));

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

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = destinationWidth;
      cropCanvas.height = destinationHeight;
      cv.imshow(cropCanvas, warped);

      const debugCanvas = document.createElement("canvas");
      debugCanvas.width = frame.width;
      debugCanvas.height = frame.height;
      const debugCtx = debugCanvas.getContext("2d");

      if (!debugCtx) {
        throw new Error("Could not create detection debug canvas context.");
      }

      debugCtx.drawImage(source.canvas, 0, 0);
      debugCtx.strokeStyle = "#00ff99";
      debugCtx.lineWidth = Math.max(2, Math.round(frame.width / 180));
      debugCtx.beginPath();
      debugCtx.moveTo(sourceQuad[0].x, sourceQuad[0].y);
      for (let i = 1; i < sourceQuad.length; i += 1) {
        debugCtx.lineTo(sourceQuad[i].x, sourceQuad[i].y);
      }
      debugCtx.closePath();
      debugCtx.stroke();

      debugCtx.fillStyle = "#ff3366";
      debugCtx.beginPath();
      debugCtx.arc(frame.clickX, frame.clickY, Math.max(4, Math.round(frame.width / 90)), 0, Math.PI * 2);
      debugCtx.fill();

      const [cropUrl, debugFrameUrl] = await Promise.all([
        canvasToObjectUrl(cropCanvas),
        canvasToObjectUrl(debugCanvas),
      ]);

      return {
        points: sourceQuad,
        cropUrl,
        debugFrameUrl,
        objectUrls: [cropUrl, debugFrameUrl],
        cropWidth: destinationWidth,
        cropHeight: destinationHeight,
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
    blurred.delete();
    edges.delete();
    morph.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
  }
}
