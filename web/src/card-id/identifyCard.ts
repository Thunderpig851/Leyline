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
  heightScale: number;
  leftPad: number;
  rightPad: number;
  scale: number;
  maxOutputWidth?: number;
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

const CARD_SIDES: CardSide[] = ["top", "right", "bottom", "left"];

const SIDE_BAND_VARIANT_SPECS: SideBandVariantSpec[] = [
  {
    name: "loose",
    topShift: -0.018,
    heightScale: 1.24,
    leftPad: 0.052,
    rightPad: 0.088,
    scale: 1.76,
    maxOutputWidth: 1980,
    contrast: 1.28,
    brightness: 14,
    sharpen: 0.22,
    threshold: null,
    transportType: "image/jpeg",
    transportQuality: 0.82,
  },
  {
    name: "wide",
    topShift: -0.012,
    heightScale: 1.14,
    leftPad: 0.03,
    rightPad: 0.05,
    scale: 1.9,
    maxOutputWidth: 1880,
    contrast: 1.42,
    brightness: 12,
    sharpen: 0.28,
    threshold: null,
    transportType: "image/jpeg",
    transportQuality: 0.84,
  },
  {
    name: "tight",
    topShift: -0.004,
    heightScale: 0.94,
    leftPad: 0.014,
    rightPad: 0.028,
    scale: 2.02,
    maxOutputWidth: 1760,
    contrast: 1.7,
    brightness: 10,
    sharpen: 0.36,
    threshold: null,
    transportType: "image/jpeg",
    transportQuality: 0.86,
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

function normalizeNameText(text: string)
{
  return normalizeWhitespace(
    text
      .replace(/[|]/g, "I")
      .replace(/[“”]/g, '"')
      .replace(/[‘’`]/g, "'")
      .replace(/[^A-Za-z0-9 ',:/\-]/g, " ")
  );
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

  const padX = Math.max(2, Math.round(cropWidth * 0.04));
  const padTop = Math.max(3, Math.round(cropHeight * (cardAspect < 1 ? 0.065 : 0.045)));
  const padBottom = Math.max(2, Math.round(cropHeight * (cardAspect < 1 ? 0.04 : 0.05)));

  return cropCanvasRegion(
    source,
    cropLeft - padX,
    cropTop - padTop,
    cropWidth + padX * 2,
    cropHeight + padTop + padBottom
  );
}

function enhanceCandidateCanvas(source: HTMLCanvasElement)
{
  const enhanced = buildCanvas(source.width, source.height);
  enhanced.ctx.drawImage(source, 0, 0);

  const imageData = enhanced.ctx.getImageData(0, 0, enhanced.canvas.width, enhanced.canvas.height);
  const { data } = imageData;
  const contrast = 1.08;
  const brightness = 4;

  for (let i = 0; i < data.length; i += 4)
  {
    data[i] = clamp(Math.round((data[i] - 128) * contrast + 128 + brightness), 0, 255);
    data[i + 1] = clamp(Math.round((data[i + 1] - 128) * contrast + 128 + brightness), 0, 255);
    data[i + 2] = clamp(Math.round((data[i + 2] - 128) * contrast + 128 + brightness), 0, 255);
    data[i + 3] = 255;
  }

  enhanced.ctx.putImageData(sharpenImageData(imageData, 0.18), 0, 0);
  return enhanced.canvas;
}

function cropAndEnhanceBand(source: HTMLCanvasElement, config: BandCropConfig): LoadedCanvas
{
  const region = resolveBandRegion(source, config);
  const sx = clamp(Math.round(source.width * region.left), 0, source.width - 1);
  const sy = clamp(Math.round(source.height * region.top), 0, source.height - 1);
  const sw = clamp(Math.round(source.width * region.width), 1, source.width - sx);
  const sh = clamp(Math.round(source.height * region.height), 1, source.height - sy);
  const scaledWidth = Math.max(1, Math.round(sw * config.scale));
  const cappedWidth = config.maxOutputWidth
    ? Math.min(scaledWidth, config.maxOutputWidth)
    : scaledWidth;
  const effectiveScale = cappedWidth / Math.max(1, sw);
  const out = buildCanvas(cappedWidth, sh * effectiveScale);
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

  const left = 0.05;
  const width = 0.84;
  let bestRegion: BandRegion = {
    left,
    top: 0.028,
    width,
    height: 0.094,
  };
  let bestScore = -Infinity;

  for (const height of [0.072, 0.082, 0.092, 0.104, 0.118])
  {
    for (let top = 0.012; top <= 0.145; top += 0.008)
    {
      const region = {
        left,
        top,
        width,
        height,
      } satisfies BandRegion;
      const metrics = analyzeBandRegion(source, region);
      const center = top + height * 0.5;
      const brightnessScore = 1 - Math.min(1, Math.abs(metrics.mean - 188) / 188);
      const contrastScore = Math.min(1, metrics.stdDev / 48);
      const edgeScore = Math.min(1, metrics.normalizedEdgeEnergy / 16);
      const centerBias = 1 - Math.min(1, Math.abs(center - 0.082) / 0.08);
      const heightBias = 1 - Math.min(1, Math.abs(height - 0.094) / 0.05);
      const darkPenalty = Math.max(0, metrics.darkRatio - 0.14) * 2.8;
      const flatPenalty = Math.max(0, 0.16 - metrics.midToneRatio) * 2.0;
      const score = (
        brightnessScore * 0.24 +
        contrastScore * 0.24 +
        edgeScore * 0.22 +
        metrics.midToneRatio * 0.18 +
        centerBias * 0.15 +
        heightBias * 0.12 -
        darkPenalty -
        flatPenalty
      );

      if (score > bestScore)
      {
        bestScore = score;
        bestRegion = region;
      }
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
  const left = clamp(detected.left - spec.leftPad, 0.004, 0.18);
  const right = clamp(detected.left + detected.width + spec.rightPad, left + 0.64, 0.995);
  const top = clamp(detected.top + spec.topShift, 0.004, 0.18);
  const bottom = clamp(
    top + detected.height * spec.heightScale,
    top + 0.052,
    0.27
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

  for (const side of CARD_SIDES)
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
      const transportType = config.transportType || "image/png";
      const transportQuality = config.transportQuality ?? 0.96;
      const score = scoreBandRegionForText(band.canvas, {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
      }) +
        resolved.detectionScore * 0.45 +
        resolved.region.width * 0.22 +
        resolved.region.height * 0.08;

      await yieldToBrowser();
      const dataUrl = await blobToDataUrl(
        await canvasToBlob(band.canvas, transportType, transportQuality)
      );

      variants.push({
        label: config.label || `Name band (${side} side)`,
        canvas: band.canvas,
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

async function buildSideCardVariants(
  source: HTMLCanvasElement
): Promise<PreparedBandVariant[]>
{
  const variants: PreparedBandVariant[] = [];

  for (const side of CARD_SIDES)
  {
    const orientedCanvas = rotateCanvasQuarterTurns(
      source,
      CARD_SIDE_QUARTER_TURNS[side]
    );
    const detectedRegion = detectTitleBandRegion(orientedCanvas);
    const score = scoreBandRegionForText(orientedCanvas, detectedRegion);
    const dataUrl = await blobToDataUrl(
      await canvasToBlob(orientedCanvas, "image/jpeg", 0.9)
    );

    variants.push({
      label: `Card OCR (${side} side)`,
      canvas: orientedCanvas,
      dataUrl,
      score,
      orientationQuarterTurns: CARD_SIDE_QUARTER_TURNS[side],
      side,
      sourceKind: "card",
    });

    await yieldToBrowser();
  }

  return variants.sort((left, right) => right.score - left.score);
}

async function buildPreviewBandFromCardVariant(
  cardVariant: PreparedBandVariant
): Promise<CardIdentificationPreview | null>
{
  const side = cardVariant.side || "top";
  const orientedCanvas = cardVariant.canvas;
  let bestBand: { label: string; canvas: HTMLCanvasElement; score: number } | null = null;

  for (const spec of SIDE_BAND_VARIANT_SPECS)
  {
    const resolved = resolveOrientedSideBandRegion(orientedCanvas, spec);
    const config = buildSideBandConfig(side, spec, resolved.region);
    const band = cropAndEnhanceBand(orientedCanvas, config);
    const score = scoreBandRegionForText(band.canvas, {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    }) +
      resolved.detectionScore * 0.45 +
      resolved.region.width * 0.22 +
      resolved.region.height * 0.08;

    if (!bestBand || score > bestBand.score)
    {
      bestBand = {
        label: config.label || `Name band (${side} side)`,
        canvas: band.canvas,
        score,
      };
    }
  }

  if (!bestBand)
  {
    return null;
  }

  return {
    label: bestBand.label,
    url: await canvasToObjectUrl(bestBand.canvas, "image/png", 0.96),
  };
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

async function prepareTitleBandsFromCandidateCanvas(candidateCanvas: HTMLCanvasElement)
{
  const previewCanvas = tightenCandidateCanvas(candidateCanvas);
  await yieldToBrowser();
  const ocrCanvas = enhanceCandidateCanvas(previewCanvas);
  await yieldToBrowser();
  const previewTitleBandVariants = (await buildSideBandVariants(previewCanvas))
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
  const ocrTitleBandVariants = await buildSideBandVariants(ocrCanvas);
  const ocrCardVariants = await buildSideCardVariants(ocrCanvas);

  return {
    previewPreviews,
    previewObjectUrls,
    ocrTitleBandVariants,
    ocrCardVariants,
  };
}

async function requestTitleOcr(
  ocrTitleBandVariants: PreparedBandVariant[],
  ocrCardVariants: PreparedBandVariant[]
): Promise<{
  title: CardIdentificationText;
  candidates: IdentifiedCardCandidate[];
  titleVariantIndex: number;
  titleSourceKind: "band" | "card";
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
        cardDataUrl: ocrCardVariants[0]?.dataUrl || "",
        cardDataUrls: ocrCardVariants.map((variant) => variant.dataUrl),
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
    Math.max(
      0,
      (payload?.title?.sourceKind === "card" ? ocrCardVariants : ocrTitleBandVariants).length - 1
    )
  );

  return {
    title,
    candidates,
    titleVariantIndex,
    titleSourceKind: payload?.title?.sourceKind === "card" ? "card" : "band",
    signalsSummary: String(payload?.signalsSummary || buildSignalsSummary(title.text, candidates)),
  };
}

export async function identifyCapturedCard(
  candidateUrl: string,
  precomputedTitleBandUrl?: string,
  onProgress?: (progress: CardIdentificationProgress) => void
): Promise<CardIdentificationResult>
{
  void precomputedTitleBandUrl;
  let previewPreviews: CardIdentificationPreview[] = [];
  let previewObjectUrls: string[] = [];
  let ocrTitleBandVariants: PreparedBandVariant[] = [];
  let ocrCardVariants: PreparedBandVariant[] = [];

  const loaded = await loadCanvasFromUrl(candidateUrl);
  const prepared = await prepareTitleBandsFromCandidateCanvas(loaded.canvas);
  previewPreviews = prepared.previewPreviews;
  previewObjectUrls = prepared.previewObjectUrls;
  ocrTitleBandVariants = prepared.ocrTitleBandVariants;
  ocrCardVariants = prepared.ocrCardVariants;

  if (previewPreviews.length > 0)
  {
    onProgress?.({
      previews: previewPreviews,
      objectUrls: previewObjectUrls,
      statusText: "Title band ready",
    });
  }

  onProgress?.({
    statusText: "Sending title band to OCR",
  });

  const initialOcr = await requestTitleOcr(ocrTitleBandVariants, ocrCardVariants);
  const title = initialOcr.title;
  const candidates = initialOcr.candidates;
  const signalsSummary = initialOcr.signalsSummary;

  if (initialOcr.titleSourceKind === "card")
  {
    const winningCardVariant =
      ocrCardVariants[initialOcr.titleVariantIndex] ||
      ocrCardVariants[0];

    if (winningCardVariant)
    {
      const preview = await buildPreviewBandFromCardVariant(winningCardVariant);
      if (preview)
      {
        previewPreviews = [preview];
        previewObjectUrls = [preview.url];
      }
    }
  }
  else
  {
    const winningVariant =
      ocrTitleBandVariants[initialOcr.titleVariantIndex] ||
      ocrTitleBandVariants[0];

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
