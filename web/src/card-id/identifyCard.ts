import { API_BASE } from "../lib/api";

export type IdentifiedCardCandidate = {
  id: string;
  name: string;
  imageUrl: string;
  scryfallUri: string;
  titleSimilarity: number;
  typeSimilarity: number;
  score: number;
};

export type CardIdentificationPreview = {
  label: string;
  url: string;
};

export type CardIdentificationText = {
  text: string;
  confidence: number;
};

export type CardIdentificationResult = {
  previews: CardIdentificationPreview[];
  title: CardIdentificationText;
  signalsSummary: string;
  candidates: IdentifiedCardCandidate[];
  objectUrls: string[];
  correctedCandidateUrl?: string;
};

export type CardIdentificationProgress = {
  previews?: CardIdentificationPreview[];
  objectUrls?: string[];
  statusText?: string;
};

type LoadedCanvas = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

type BandCropConfig = {
  label?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  anchorToTitleBand?: boolean;
  topOffset?: number;
  heightScale?: number;
  scale: number;
  maxOutputWidth?: number;
  minOutputHeight?: number;
  contrast: number;
  brightness: number;
  sharpen: number;
  threshold?: number | null;
  transportType?: "image/jpeg" | "image/png";
  transportQuality?: number;
};

type PreparedBandVariant = {
  label: string;
  canvas: HTMLCanvasElement;
  dataUrl: string;
  score: number;
  orientationQuarterTurns?: number;
  side?: CardSide;
  sourceKind: "band" | "card";
};

type BandRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CardSide = "top" | "right" | "bottom" | "left";

type SideBandVariantSpec = {
  name: string;
  topShift: number;
  bottomShift: number;
  leftPad: number;
  rightPad: number;
  scale: number;
  maxOutputWidth?: number;
  minOutputHeight?: number;
  contrast: number;
  brightness: number;
  sharpen: number;
  threshold?: number | null;
  transportType?: "image/jpeg" | "image/png";
  transportQuality?: number;
};

type ExistingBandVariantSpec = {
  label: string;
  scale: number;
  maxOutputWidth?: number;
  minOutputHeight?: number;
  contrast: number;
  brightness: number;
  sharpen: number;
  threshold?: number | null;
  transportType?: "image/jpeg" | "image/png";
  transportQuality?: number;
};

const detectedTitleBandCache = new WeakMap<HTMLCanvasElement, BandRegion>();

const CARD_SIDE_QUARTER_TURNS: Record<CardSide, number> = {
  top: 0,
  right: 3,
  bottom: 2,
  left: 1,
};

const TITLE_SCAN_SIDES: CardSide[] = ["top", "bottom"];

const SIDE_BAND_VARIANT_SPECS: SideBandVariantSpec[] = [
  {
    name: "loose",
    topShift: 0,
    bottomShift: 0.02,
    leftPad: 0.124,
    rightPad: 0.118,
    scale: 1.76,
    maxOutputWidth: 2480,
    minOutputHeight: 170,
    contrast: 1.28,
    brightness: 14,
    sharpen: 0.22,
    threshold: null,
    transportType: "image/png",
    transportQuality: 0.96,
  },
  {
    name: "wide",
    topShift: 0,
    bottomShift: 0.016,
    leftPad: 0.106,
    rightPad: 0.092,
    scale: 1.9,
    maxOutputWidth: 2440,
    minOutputHeight: 182,
    contrast: 1.42,
    brightness: 12,
    sharpen: 0.28,
    threshold: null,
    transportType: "image/png",
    transportQuality: 0.96,
  },
  {
    name: "tight",
    topShift: 0,
    bottomShift: 0.008,
    leftPad: 0.086,
    rightPad: 0.07,
    scale: 2.02,
    maxOutputWidth: 2360,
    minOutputHeight: 194,
    contrast: 1.7,
    brightness: 10,
    sharpen: 0.36,
    threshold: null,
    transportType: "image/png",
    transportQuality: 0.96,
  },
];

const PRECOMPUTED_TITLE_BAND_SPECS: ExistingBandVariantSpec[] = [
  {
    label: "Name band (OpenCV)",
    scale: 1.8,
    maxOutputWidth: 2280,
    minOutputHeight: 170,
    contrast: 1.2,
    brightness: 6,
    sharpen: 0.18,
    threshold: null,
    transportType: "image/png",
    transportQuality: 0.96,
  },
  {
    label: "Name band enhanced (OpenCV)",
    scale: 2.05,
    maxOutputWidth: 2360,
    minOutputHeight: 184,
    contrast: 1.55,
    brightness: 10,
    sharpen: 0.28,
    threshold: null,
    transportType: "image/png",
    transportQuality: 0.96,
  },
  {
    label: "Name band binary (OpenCV)",
    scale: 2.05,
    maxOutputWidth: 2360,
    minOutputHeight: 184,
    contrast: 2.02,
    brightness: 8,
    sharpen: 0.32,
    threshold: 158,
    transportType: "image/png",
    transportQuality: 0.96,
  },
];

function clamp(value: number, min: number, max: number)
{
  return Math.max(min, Math.min(max, value));
}

function normalizeWhitespace(text: string)
{
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingTitleNoise(text: string)
{
  const normalized = normalizeWhitespace(text);
  if (!/[A-Za-z]{4,}/.test(normalized))
  {
    return normalized;
  }

  const stripped = normalized.replace(/\s+\d{1,3}\s*$/, "").trim();
  return stripped.length >= 4 ? stripped : normalized;
}

function normalizeNameText(text: string)
{
  return stripTrailingTitleNoise(normalizeWhitespace(
    text
      .replace(/[|]/g, "I")
      .replace(/[“”]/g, '"')
      .replace(/[‘’`]/g, "'")
      .replace(/[^A-Za-z0-9 ',:/\-]/g, " ")
  ));
}

function buildCanvas(width: number, height: number): LoadedCanvas
{
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create canvas context");
  }

  return { canvas, ctx };
}

async function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.96)
{
  return new Promise<Blob>((resolve, reject) =>
  {
    canvas.toBlob((blob) =>
    {
      if (!blob)
      {
        reject(new Error("Failed to create canvas blob"));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement, type = "image/png", quality = 0.96)
{
  const blob = await canvasToBlob(canvas, type, quality);
  return URL.createObjectURL(blob);
}

async function blobToDataUrl(blob: Blob)
{
  return new Promise<string>((resolve, reject) =>
  {
    const reader = new FileReader();
    reader.onload = () =>
    {
      if (typeof reader.result === "string")
      {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to encode image blob"));
    };
    reader.onerror = () => reject(new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number)
{
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try
  {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  }
  catch (error)
  {
    if (error instanceof DOMException && error.name === "AbortError")
    {
      throw new Error("Card OCR timed out");
    }

    throw error;
  }
  finally
  {
    window.clearTimeout(timeout);
  }
}

function yieldToBrowser()
{
  return new Promise<void>((resolve) =>
  {
    window.setTimeout(resolve, 0);
  });
}

async function loadImage(url: string)
{
  const image = new Image();
  image.decoding = "async";
  image.loading = "eager";

  await new Promise<void>((resolve, reject) =>
  {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = url;
  });

  return image;
}

async function loadCanvasFromUrl(url: string): Promise<LoadedCanvas>
{
  const image = await loadImage(url);
  const loaded = buildCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
  loaded.ctx.drawImage(image, 0, 0, loaded.canvas.width, loaded.canvas.height);
  return loaded;
}

function rotateCanvasQuarterTurns(source: HTMLCanvasElement, quarterTurns: number): HTMLCanvasElement
{
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0)
  {
    return source;
  }

  const swapSides = turns % 2 === 1;
  const rotated = buildCanvas(
    swapSides ? source.height : source.width,
    swapSides ? source.width : source.height
  );

  rotated.ctx.translate(rotated.canvas.width / 2, rotated.canvas.height / 2);
  rotated.ctx.rotate((Math.PI / 2) * turns);
  rotated.ctx.drawImage(source, -source.width / 2, -source.height / 2);

  return rotated.canvas;
}

function sharpenImageData(imageData: ImageData, amount = 0.35)
{
  const { data, width, height } = imageData;
  const original = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y += 1)
  {
    for (let x = 1; x < width - 1; x += 1)
    {
      const accum = [0, 0, 0];
      let kernelIndex = 0;

      for (let ky = -1; ky <= 1; ky += 1)
      {
        for (let kx = -1; kx <= 1; kx += 1)
        {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const weight = kernel[kernelIndex];
          accum[0] += original[idx] * weight;
          accum[1] += original[idx + 1] * weight;
          accum[2] += original[idx + 2] * weight;
          kernelIndex += 1;
        }
      }

      const idx = (y * width + x) * 4;
      data[idx] = clamp(Math.round(original[idx] * (1 - amount) + accum[0] * amount), 0, 255);
      data[idx + 1] = clamp(Math.round(original[idx + 1] * (1 - amount) + accum[1] * amount), 0, 255);
      data[idx + 2] = clamp(Math.round(original[idx + 2] * (1 - amount) + accum[2] * amount), 0, 255);
      data[idx + 3] = 255;
    }
  }

  return imageData;
}

function analyzeCanvasLuma(source: HTMLCanvasElement)
{
  const ctx = source.getContext("2d", { willReadFrequently: true });

  if (!ctx)
  {
    throw new Error("Could not create candidate analysis context");
  }

  const imageData = ctx.getImageData(0, 0, source.width, source.height);
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1)
  {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  return { gray, width, height };
}

function buildCandidateEdgeProfiles(source: HTMLCanvasElement)
{
  const { gray, width, height } = analyzeCanvasLuma(source);
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
      total += edge * 1.15 + dark * 0.18;
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
      total += edge * 1.15 + dark * 0.18;
    }

    rowProfile[y] = total / Math.max(1, innerRight - innerLeft);
  }

  return { colProfile, rowProfile };
}

function smoothProfile(profile: Float32Array, radius = 2)
{
  const smoothed = new Float32Array(profile.length);

  for (let i = 0; i < profile.length; i += 1)
  {
    let total = 0;
    let count = 0;

    for (let offset = -radius; offset <= radius; offset += 1)
    {
      const index = i + offset;
      if (index < 0 || index >= profile.length)
      {
        continue;
      }

      total += profile[index];
      count += 1;
    }

    smoothed[i] = count > 0 ? total / count : profile[i];
  }

  return smoothed;
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

function cropCanvasRegion(source: HTMLCanvasElement, x: number, y: number, width: number, height: number)
{
  const sx = clamp(Math.round(x), 0, source.width - 1);
  const sy = clamp(Math.round(y), 0, source.height - 1);
  const sw = clamp(Math.round(width), 1, source.width - sx);
  const sh = clamp(Math.round(height), 1, source.height - sy);
  const out = buildCanvas(sw, sh);
  out.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.canvas;
}

function tightenCandidateCanvas(source: HTMLCanvasElement)
{
  const { colProfile, rowProfile } = buildCandidateEdgeProfiles(source);
  const smoothCols = smoothProfile(colProfile, 3);
  const smoothRows = smoothProfile(rowProfile, 3);
  const leftPeak = findProfilePeak(
    smoothCols,
    Math.max(1, Math.round(source.width * 0.04)),
    Math.max(3, Math.round(source.width * 0.42))
  );
  const rightPeak = findProfilePeak(
    smoothCols,
    Math.max(2, Math.round(source.width * 0.58)),
    Math.max(2, Math.round(source.width * 0.96))
  );
  const topPeak = findProfilePeak(
    smoothRows,
    Math.max(1, Math.round(source.height * 0.03)),
    Math.max(3, Math.round(source.height * 0.32))
  );
  const bottomPeak = findProfilePeak(
    smoothRows,
    Math.max(2, Math.round(source.height * 0.68)),
    Math.max(2, Math.round(source.height * 0.97))
  );

  let cropLeft = Math.max(0, leftPeak - 3);
  let cropRight = Math.min(source.width - 1, rightPeak + 3);
  let cropTop = Math.max(0, topPeak - 4);
  let cropBottom = Math.min(source.height - 1, bottomPeak + 3);
  let cropWidth = cropRight - cropLeft + 1;
  let cropHeight = cropBottom - cropTop + 1;

  if (cropWidth < source.width * 0.4 || cropHeight < source.height * 0.4)
  {
    return source;
  }

  const centerX = cropLeft + cropWidth / 2;
  const centerY = cropTop + cropHeight / 2;
  const aspect = cropWidth / Math.max(1, cropHeight);
  const portraitAspect = 63 / 88;
  const landscapeAspect = 88 / 63;
  const cardAspect =
    Math.abs(aspect - portraitAspect) <= Math.abs(aspect - landscapeAspect)
      ? portraitAspect
      : landscapeAspect;

  if (Math.abs(aspect - cardAspect) > 0.06)
  {
    if (aspect > cardAspect)
    {
      cropWidth = Math.round(cropHeight * cardAspect);
    }
    else
    {
      cropHeight = Math.round(cropWidth / cardAspect);
    }

    cropLeft = clamp(Math.round(centerX - cropWidth / 2), 0, source.width - cropWidth);
    cropTop = clamp(Math.round(centerY - cropHeight / 2), 0, source.height - cropHeight);
  }

  const padX = Math.max(4, Math.round(cropWidth * 0.07));
  const padTop = Math.max(6, Math.round(cropHeight * (cardAspect < 1 ? 0.105 : 0.09)));
  const padBottom = Math.max(5, Math.round(cropHeight * (cardAspect < 1 ? 0.08 : 0.07)));

  return cropCanvasRegion(
    source,
    cropLeft - padX,
    cropTop - padTop,
    cropWidth + padX * 2,
    cropHeight + padTop + padBottom
  );
}

function cropAndEnhanceBand(source: HTMLCanvasElement, config: BandCropConfig): LoadedCanvas
{
  const region = resolveBandRegion(source, config);
  const sx = clamp(Math.round(source.width * region.left), 0, source.width - 1);
  const sy = clamp(Math.round(source.height * region.top), 0, source.height - 1);
  const sw = clamp(Math.round(source.width * region.width), 1, source.width - sx);
  const sh = clamp(Math.round(source.height * region.height), 1, source.height - sy);
  const targetScale = Math.max(
    config.scale,
    config.minOutputHeight ? config.minOutputHeight / Math.max(1, sh) : 0
  );
  const scaledWidth = Math.max(1, Math.round(sw * targetScale));
  const cappedWidth = Math.max(sw, config.maxOutputWidth
    ? Math.min(scaledWidth, config.maxOutputWidth)
    : scaledWidth);
  const effectiveScale = cappedWidth / Math.max(1, sw);
  const out = buildCanvas(cappedWidth, Math.max(sh, Math.round(sh * effectiveScale)));
  out.ctx.imageSmoothingEnabled = true;
  out.ctx.imageSmoothingQuality = "high";
  out.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.canvas.width, out.canvas.height);

  const imageData = out.ctx.getImageData(0, 0, out.canvas.width, out.canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4)
  {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    let value = (gray - 128) * config.contrast + 128 + config.brightness;

    if (config.threshold != null)
    {
      value = value >= config.threshold ? 255 : 0;
    }

    const clamped = clamp(Math.round(value), 0, 255);
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
    data[i + 3] = 255;
  }

  out.ctx.putImageData(sharpenImageData(imageData, config.sharpen), 0, 0);
  return out;
}

function addBandOcrMargin(source: HTMLCanvasElement): HTMLCanvasElement
{
  const leftPad = Math.max(10, Math.round(source.width * 0.07));
  const rightPad = Math.max(6, Math.round(source.width * 0.028));
  const topPad = Math.max(8, Math.round(source.height * 0.18));
  const bottomPad = Math.max(6, Math.round(source.height * 0.07));
  const padded = buildCanvas(
    source.width + leftPad + rightPad,
    source.height + topPad + bottomPad
  );

  padded.ctx.fillStyle = "#ffffff";
  padded.ctx.fillRect(0, 0, padded.canvas.width, padded.canvas.height);
  padded.ctx.drawImage(source, leftPad, topPad);

  return padded.canvas;
}

function analyzeBandRegion(source: HTMLCanvasElement, region: BandRegion)
{
  const sx = clamp(Math.round(source.width * region.left), 0, source.width - 1);
  const sy = clamp(Math.round(source.height * region.top), 0, source.height - 1);
  const sw = clamp(Math.round(source.width * region.width), 4, source.width - sx);
  const sh = clamp(Math.round(source.height * region.height), 4, source.height - sy);
  const sample = buildCanvas(sw, sh);
  sample.ctx.imageSmoothingEnabled = true;
  sample.ctx.imageSmoothingQuality = "high";
  sample.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  const imageData = sample.ctx.getImageData(0, 0, sw, sh);
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  let total = 0;
  let midTonePixels = 0;
  let darkPixels = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1)
  {
    const value = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[p] = value;
    total += value;

    if (value >= 55 && value <= 235)
    {
      midTonePixels += 1;
    }

    if (value <= 28)
    {
      darkPixels += 1;
    }
  }

  const mean = total / Math.max(1, gray.length);
  let variance = 0;
  let edgeEnergy = 0;

  for (let y = 0; y < height; y += 1)
  {
    for (let x = 0; x < width; x += 1)
    {
      const idx = y * width + x;
      const value = gray[idx];
      variance += (value - mean) * (value - mean);

      if (x > 0)
      {
        edgeEnergy += Math.abs(value - gray[idx - 1]);
      }

      if (y > 0)
      {
        edgeEnergy += Math.abs(value - gray[idx - width]);
      }
    }
  }

  const stdDev = Math.sqrt(variance / Math.max(1, gray.length));
  const normalizedEdgeEnergy = edgeEnergy / Math.max(1, width * height);
  const midToneRatio = midTonePixels / Math.max(1, gray.length);
  const darkRatio = darkPixels / Math.max(1, gray.length);

  return {
    mean,
    stdDev,
    normalizedEdgeEnergy,
    midToneRatio,
    darkRatio,
  };
}

function detectTitleBandRegion(source: HTMLCanvasElement): BandRegion
{
  const cached = detectedTitleBandCache.get(source);
  if (cached)
  {
    return cached;
  }

  const left = 0.004;
  const width = 0.944;
  let bestRegion: BandRegion = {
    left,
    top: 0,
    width,
    height: 0.072,
  };
  let bestScore = -Infinity;

  for (const height of [0.06, 0.066, 0.072, 0.08, 0.088])
  {
    const region = {
      left,
      top: 0,
      width,
      height,
    } satisfies BandRegion;
    const metrics = analyzeBandRegion(source, region);
    const belowTop = height;
    const belowHeight = Math.min(0.078, Math.max(0, 1 - belowTop));
    const belowMetrics = belowHeight >= 0.02
      ? analyzeBandRegion(source, {
        left,
        top: belowTop,
        width,
        height: belowHeight,
      })
      : null;
    const brightnessScore = 1 - Math.min(1, Math.abs(metrics.mean - 188) / 188);
    const contrastScore = Math.min(1, metrics.stdDev / 48);
    const edgeScore = Math.min(1, metrics.normalizedEdgeEnergy / 16);
    const heightBias = 1 - Math.min(1, Math.abs(height - 0.072) / 0.024);
    const bottomBias = 1 - Math.min(1, Math.max(0, belowTop - 0.09) / 0.046);
    const belowTextPenalty = belowMetrics
      ? Math.max(
        0,
        (
          Math.min(1, belowMetrics.normalizedEdgeEnergy / 20) * 0.55 +
          Math.min(1, belowMetrics.stdDev / 60) * 0.3 +
          belowMetrics.midToneRatio * 0.15
        ) - 0.56
      ) * 1.32
      : 0;
    const darkPenalty = Math.max(0, metrics.darkRatio - 0.14) * 2.8;
    const flatPenalty = Math.max(0, 0.16 - metrics.midToneRatio) * 2.0;
    const score = (
      brightnessScore * 0.24 +
      contrastScore * 0.23 +
      edgeScore * 0.23 +
      metrics.midToneRatio * 0.16 +
      heightBias * 0.18 +
      bottomBias * 0.2 -
      belowTextPenalty -
      darkPenalty -
      flatPenalty
    );

    if (score > bestScore)
    {
      bestScore = score;
      bestRegion = region;
    }
  }

  detectedTitleBandCache.set(source, bestRegion);
  return bestRegion;
}

function resolveBandRegion(source: HTMLCanvasElement, config: BandCropConfig): BandRegion
{
  if (!config.anchorToTitleBand)
  {
    return {
      left: config.left,
      top: config.top,
      width: config.width,
      height: config.height,
    };
  }

  const detected = detectTitleBandRegion(source);

  return {
    left: config.left,
    top: clamp(detected.top + (config.topOffset ?? 0), 0, 0.24),
    width: config.width,
    height: clamp(detected.height * (config.heightScale ?? 1), 0.05, 0.18),
  };
}

function scoreBandRegionForText(source: HTMLCanvasElement, region: BandRegion)
{
  const metrics = analyzeBandRegion(source, region);
  const brightnessScore = 1 - Math.min(1, Math.abs(metrics.mean - 176) / 176);
  const contrastScore = Math.min(1, metrics.stdDev / 52);
  const edgeScore = Math.min(1, metrics.normalizedEdgeEnergy / 18);
  const darkPenalty = Math.max(0, metrics.darkRatio - 0.18) * 2.3;
  const flatPenalty = Math.max(0, 0.14 - metrics.midToneRatio) * 2.1;

  return (
    brightnessScore * 0.26 +
    contrastScore * 0.32 +
    edgeScore * 0.34 +
    metrics.midToneRatio * 0.18 -
    darkPenalty -
    flatPenalty
  );
}

function resolveOrientedSideBandRegion(
  source: HTMLCanvasElement,
  spec: SideBandVariantSpec
): { region: BandRegion; detectionScore: number }
{
  const detected = detectTitleBandRegion(source);
  const left = clamp(detected.left - spec.leftPad, 0, 0.18);
  const right = clamp(detected.left + detected.width + spec.rightPad, left + 0.72, 1);
  const top = clamp(detected.top + spec.topShift, 0, 0.16);
  const detectedBottom = detected.top + detected.height;
  const bottom = clamp(
    detectedBottom + spec.bottomShift,
    top + 0.058,
    0.176
  );

  return {
    region: {
      left,
      top,
      width: right - left,
      height: bottom - top,
    },
    detectionScore: scoreBandRegionForText(source, detected),
  };
}

function buildSideBandConfig(
  side: CardSide,
  spec: SideBandVariantSpec,
  region: BandRegion
): BandCropConfig
{
  return {
    label: `Name band ${spec.name} (${side} side)`,
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
    scale: spec.scale,
    maxOutputWidth: spec.maxOutputWidth,
    minOutputHeight: spec.minOutputHeight,
    contrast: spec.contrast,
    brightness: spec.brightness,
    sharpen: spec.sharpen,
    threshold: spec.threshold,
    transportType: spec.transportType,
    transportQuality: spec.transportQuality,
  };
}

async function buildSideBandVariants(
  source: HTMLCanvasElement
): Promise<PreparedBandVariant[]>
{
  const variants: PreparedBandVariant[] = [];

  for (const side of TITLE_SCAN_SIDES)
  {
    const orientedCanvas = rotateCanvasQuarterTurns(
      source,
      CARD_SIDE_QUARTER_TURNS[side]
    );

    for (const spec of SIDE_BAND_VARIANT_SPECS)
    {
      const resolved = resolveOrientedSideBandRegion(orientedCanvas, spec);
      const config = buildSideBandConfig(side, spec, resolved.region);
      const band = cropAndEnhanceBand(orientedCanvas, config);
      const transportCanvas = addBandOcrMargin(band.canvas);
      const transportType = config.transportType || "image/png";
      const transportQuality = config.transportQuality ?? 0.96;
      const leftFit = 1 - Math.min(1, resolved.region.left / 0.035);
      const widthFit = 1 - Math.min(1, Math.abs(resolved.region.width - 0.93) / 0.16);
      const heightFit = 1 - Math.min(1, Math.abs(resolved.region.height - 0.07) / 0.024);
      const topFit = 1 - Math.min(1, resolved.region.top / 0.012);
      const bottomFit = 1 - Math.min(
        1,
        Math.abs((resolved.region.top + resolved.region.height) - 0.076) / 0.034
      );
      const score = scoreBandRegionForText(band.canvas, {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
      }) +
        resolved.detectionScore * 0.48 +
        leftFit * 0.24 +
        widthFit * 0.1 +
        heightFit * 0.26 +
        topFit * 0.3 +
        bottomFit * 0.22;

      await yieldToBrowser();
      const dataUrl = await blobToDataUrl(
        await canvasToBlob(transportCanvas, transportType, transportQuality)
      );

      variants.push({
        label: config.label || `Name band (${side} side)`,
        canvas: transportCanvas,
        dataUrl,
        score,
        orientationQuarterTurns: CARD_SIDE_QUARTER_TURNS[side],
        side,
        sourceKind: "band",
      });

      await yieldToBrowser();
    }
  }

  return variants
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

async function buildProvidedTitleBandVariants(
  source: HTMLCanvasElement
): Promise<PreparedBandVariant[]>
{
  const variants: PreparedBandVariant[] = [];

  for (const spec of PRECOMPUTED_TITLE_BAND_SPECS)
  {
    const band = cropAndEnhanceBand(source, {
      label: spec.label,
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      scale: spec.scale,
      maxOutputWidth: spec.maxOutputWidth,
      minOutputHeight: spec.minOutputHeight,
      contrast: spec.contrast,
      brightness: spec.brightness,
      sharpen: spec.sharpen,
      threshold: spec.threshold,
      transportType: spec.transportType,
      transportQuality: spec.transportQuality,
    });
    const transportCanvas = addBandOcrMargin(band.canvas);
    const transportType = spec.transportType || "image/png";
    const transportQuality = spec.transportQuality ?? 0.96;
    const score = scoreBandRegionForText(band.canvas, {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });

    await yieldToBrowser();
    const dataUrl = await blobToDataUrl(
      await canvasToBlob(transportCanvas, transportType, transportQuality)
    );

    variants.push({
      label: spec.label,
      canvas: transportCanvas,
      dataUrl,
      score: score + 0.18,
      side: "top",
      sourceKind: "band",
    });

    await yieldToBrowser();
  }

  return variants.sort((left, right) => right.score - left.score);
}

function buildSignalsSummary(
  titleText: string,
  candidates: IdentifiedCardCandidate[]
)
{
  const signals: string[] = [];

  if (titleText)
  {
    signals.push(`name signal: ${titleText}`);
  }

  if (candidates[0]?.name)
  {
    signals.push(`best match: ${candidates[0].name}`);
  }

  return signals.join(" • ");
}

function looksWeakTitleResult(
  title: CardIdentificationText,
  candidates: IdentifiedCardCandidate[]
)
{
  const letterCount = (title.text.match(/[A-Za-z]/g) || []).length;
  const bestCandidateScore = candidates[0]?.score || 0;
  const normalizedConfidence = clamp(title.confidence, 0, 1);

  return (
    bestCandidateScore < 0.45 ||
    (letterCount < 5 && normalizedConfidence < 0.62) ||
    (letterCount < 8 && normalizedConfidence < 0.32)
  );
}

function scoreTitleResultStrength(
  title: CardIdentificationText,
  candidates: IdentifiedCardCandidate[]
)
{
  const letterCount = (title.text.match(/[A-Za-z]/g) || []).length;
  const bestCandidateScore = candidates[0]?.score || 0;

  return (
    Math.min(1, letterCount / 10) * 0.4 +
    clamp(title.confidence, 0, 1) * 0.25 +
    bestCandidateScore * 1.1
  );
}

async function prepareTitleBandsFromCandidateCanvas(candidateCanvas: HTMLCanvasElement)
{
  const previewCanvas = tightenCandidateCanvas(candidateCanvas);
  await yieldToBrowser();
  const previewCandidateVariants = await buildSideBandVariants(previewCanvas);
  const previewTitleBandVariants = (
    previewCandidateVariants.filter((variant) => variant.side === "top").length > 0
      ? previewCandidateVariants.filter((variant) => variant.side === "top")
      : previewCandidateVariants
  )
    .sort((a, b) => b.score - a.score)
    .slice(0, 1);
  await yieldToBrowser();
  const previewBand = previewTitleBandVariants[0];
  const previewTitleBandUrl = previewBand
    ? await canvasToObjectUrl(previewBand.canvas, "image/png", 0.96)
    : "";
  const previewPreviews = previewTitleBandUrl
    ? [{ label: previewBand?.label || "Name band", url: previewTitleBandUrl }]
    : [];
  const previewObjectUrls = previewPreviews.map((preview) => preview.url);
  const ocrTitleBandVariants = previewCandidateVariants;

  return {
    previewPreviews,
    previewObjectUrls,
    ocrTitleBandVariants,
  };
}

async function requestTitleOcr(
  ocrTitleBandVariants: PreparedBandVariant[]
): Promise<{
  title: CardIdentificationText;
  candidates: IdentifiedCardCandidate[];
  titleVariantIndex: number;
  signalsSummary: string;
}>
{
  const response = await fetchWithTimeout(
    `${API_BASE}/api/card-id/identify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        titleBandDataUrl: ocrTitleBandVariants[0]?.dataUrl || "",
        titleBandDataUrls: ocrTitleBandVariants.map((variant) => variant.dataUrl),
      }),
    },
    15000
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok)
  {
    throw new Error(payload?.error || "Card OCR failed");
  }

  const title = {
    text: normalizeNameText(String(payload?.title?.text || "")),
    confidence: Number(payload?.title?.confidence || 0),
  } satisfies CardIdentificationText;
  const candidates = Array.isArray(payload?.candidates)
    ? payload.candidates as IdentifiedCardCandidate[]
    : [];
  const titleVariantIndex = clamp(
    Number(payload?.title?.variantIndex || 0),
    0,
    Math.max(0, ocrTitleBandVariants.length - 1)
  );

  return {
    title,
    candidates,
    titleVariantIndex,
    signalsSummary: String(payload?.signalsSummary || buildSignalsSummary(title.text, candidates)),
  };
}

export async function identifyCapturedCard(
  candidateUrl: string,
  precomputedTitleBandUrl?: string,
  onProgress?: (progress: CardIdentificationProgress) => void
): Promise<CardIdentificationResult>
{
  let previewPreviews: CardIdentificationPreview[] = [];
  let previewObjectUrls: string[] = [];
  let scanTitleBandVariants: PreparedBandVariant[] = [];

  const loaded = await loadCanvasFromUrl(candidateUrl);
  const prepared = await prepareTitleBandsFromCandidateCanvas(loaded.canvas);
  previewPreviews = prepared.previewPreviews;
  previewObjectUrls = prepared.previewObjectUrls;
  scanTitleBandVariants = prepared.ocrTitleBandVariants;

  if (previewPreviews.length > 0)
  {
    onProgress?.({
      previews: previewPreviews,
      objectUrls: previewObjectUrls,
      statusText: "Title band ready",
    });
  }

  onProgress?.({
    statusText: "Scanning top title band",
  });

  const preferredTopVariants = scanTitleBandVariants.filter((variant) => variant.side === "top");
  const hasBottomVariants = scanTitleBandVariants.some((variant) => variant.side === "bottom");
  let activeTitleBandVariants = preferredTopVariants.length > 0
    ? preferredTopVariants
    : scanTitleBandVariants;
  let initialOcr = await requestTitleOcr(activeTitleBandVariants);

  if (
    precomputedTitleBandUrl &&
    looksWeakTitleResult(initialOcr.title, initialOcr.candidates)
  )
  {
    try
    {
      const providedBand = await loadCanvasFromUrl(precomputedTitleBandUrl);
      const providedVariants = await buildProvidedTitleBandVariants(providedBand.canvas);

      if (providedVariants.length > 0)
      {
        onProgress?.({
          previews: [{
            label: "Name band (OpenCV)",
            url: precomputedTitleBandUrl,
          }],
          objectUrls: [],
          statusText: "Retrying title OCR with OpenCV band",
        });

        const fallbackOcr = await requestTitleOcr(providedVariants);
        if (
          scoreTitleResultStrength(fallbackOcr.title, fallbackOcr.candidates) >
          scoreTitleResultStrength(initialOcr.title, initialOcr.candidates) + 0.08
        )
        {
          initialOcr = fallbackOcr;
          activeTitleBandVariants = providedVariants;
        }
      }
    }
    catch (error)
    {
      console.warn("Failed to use precomputed title band", error);
    }
  }

  if (
    hasBottomVariants &&
    activeTitleBandVariants !== scanTitleBandVariants &&
    looksWeakTitleResult(initialOcr.title, initialOcr.candidates)
  )
  {
    onProgress?.({
      statusText: "Retrying title OCR with bottom-edge fallback",
    });

    const bottomRetryOcr = await requestTitleOcr(scanTitleBandVariants);
    if (
      scoreTitleResultStrength(bottomRetryOcr.title, bottomRetryOcr.candidates) >
      scoreTitleResultStrength(initialOcr.title, initialOcr.candidates) + 0.14
    )
    {
      initialOcr = bottomRetryOcr;
      activeTitleBandVariants = scanTitleBandVariants;
    }
  }

  const title = initialOcr.title;
  const candidates = initialOcr.candidates;
  const signalsSummary = initialOcr.signalsSummary;
  const winningVariant =
    activeTitleBandVariants[initialOcr.titleVariantIndex] ||
    activeTitleBandVariants[0];

  if (winningVariant)
  {
    const winningPreviewUrl = await canvasToObjectUrl(winningVariant.canvas, "image/png", 0.96);
    previewPreviews = [
      {
        label: winningVariant.label,
        url: winningPreviewUrl,
      },
    ];
    previewObjectUrls = [winningPreviewUrl];
  }

  const previews: CardIdentificationPreview[] = previewPreviews;

  return {
    previews,
    title,
    signalsSummary,
    candidates,
    objectUrls: previewObjectUrls,
  };
}
