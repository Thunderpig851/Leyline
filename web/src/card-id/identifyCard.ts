import { API_BASE } from "../lib/api";

export type IdentifiedCardCandidate = {
  id: string;
  name: string;
  imageUrl: string;
  scryfallUri: string;
  typeLine: string;
  titleSimilarity: number;
  typeSimilarity: number;
  artSimilarity: number;
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
  typeLine: CardIdentificationText;
  footer: CardIdentificationText;
  art: CardIdentificationPreview | null;
  signalsSummary: string;
  candidates: IdentifiedCardCandidate[];
  objectUrls: string[];
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
  scale: number;
  contrast: number;
  brightness: number;
  sharpen: number;
  threshold?: number | null;
};

type PreparedBandVariant = {
  label: string;
  canvas: HTMLCanvasElement;
  dataUrl: string;
};

type ScryfallAutocompleteResponse = {
  object: "autocomplete";
  data: string[];
};

type ScryfallCard = {
  id: string;
  name: string;
  type_line?: string;
  scryfall_uri?: string;
  image_uris?: {
    normal?: string;
    large?: string;
    png?: string;
  };
  card_faces?: Array<{
    image_uris?: {
      normal?: string;
      large?: string;
      png?: string;
    };
  }>;
};

const TITLE_BAND_CONFIGS: BandCropConfig[] = [
  {
    label: "Name band",
    left: 0.066,
    top: 0.03,
    width: 0.79,
    height: 0.112,
    scale: 6,
    contrast: 1.55,
    brightness: 10,
    sharpen: 0.38,
    threshold: null,
  },
  {
    label: "Name band tight",
    left: 0.075,
    top: 0.04,
    width: 0.69,
    height: 0.084,
    scale: 7,
    contrast: 1.9,
    brightness: 10,
    sharpen: 0.46,
    threshold: null,
  },
  {
    label: "Name band binary",
    left: 0.07,
    top: 0.034,
    width: 0.73,
    height: 0.1,
    scale: 7,
    contrast: 2.18,
    brightness: 8,
    sharpen: 0.42,
    threshold: 160,
  },
];

const TYPE_BAND_CONFIGS: BandCropConfig[] = [
  {
    label: "Type band",
    left: 0.074,
    top: 0.595,
    width: 0.82,
    height: 0.104,
    scale: 6,
    contrast: 1.65,
    brightness: 8,
    sharpen: 0.35,
    threshold: null,
  },
  {
    label: "Type band tight",
    left: 0.078,
    top: 0.607,
    width: 0.79,
    height: 0.084,
    scale: 7,
    contrast: 1.95,
    brightness: 10,
    sharpen: 0.44,
    threshold: null,
  },
  {
    label: "Type band binary",
    left: 0.074,
    top: 0.598,
    width: 0.8,
    height: 0.094,
    scale: 7,
    contrast: 2.1,
    brightness: 7,
    sharpen: 0.4,
    threshold: 152,
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

function normalizeTypeText(text: string)
{
  return normalizeWhitespace(
    text
      .replace(/[|]/g, "I")
      .replace(/[“”]/g, '"')
      .replace(/[‘’`]/g, "'")
      .replace(/[^A-Za-z0-9 ',:/\-]/g, " ")
  );
}

function clampIndex(value: number, length: number)
{
  if (!Number.isFinite(value) || length <= 0)
  {
    return 0;
  }

  return clamp(Math.round(value), 0, length - 1);
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

function cropAndEnhanceBand(source: HTMLCanvasElement, config: BandCropConfig): LoadedCanvas
{
  const sx = clamp(Math.round(source.width * config.left), 0, source.width - 1);
  const sy = clamp(Math.round(source.height * config.top), 0, source.height - 1);
  const sw = clamp(Math.round(source.width * config.width), 1, source.width - sx);
  const sh = clamp(Math.round(source.height * config.height), 1, source.height - sy);

  const out = buildCanvas(sw * config.scale, sh * config.scale);
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

function buildBandVariants(source: HTMLCanvasElement, configs: BandCropConfig[]): PreparedBandVariant[]
{
  return configs.map((config) =>
  {
    const band = cropAndEnhanceBand(source, config);

    return {
      label: config.label || "OCR band",
      canvas: band.canvas,
      dataUrl: band.canvas.toDataURL("image/png", 0.96),
    };
  });
}

function wordSet(text: string)
{
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  );
}

function diceCoefficient(a: string, b: string)
{
  const left = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const right = b.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1)
  {
    const gram = left.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < right.length - 1; i += 1)
  {
    const gram = right.slice(i, i + 2);
    const count = bigrams.get(gram) || 0;
    if (count > 0)
    {
      intersection += 1;
      bigrams.set(gram, count - 1);
    }
  }

  return (2 * intersection) / ((left.length - 1) + (right.length - 1));
}

function typeOverlapScore(sourceText: string, candidateTypeLine: string)
{
  const sourceWords = wordSet(sourceText);
  const candidateWords = wordSet(candidateTypeLine);

  if (sourceWords.size === 0 || candidateWords.size === 0)
  {
    return 0;
  }

  let matches = 0;
  for (const word of sourceWords)
  {
    if (candidateWords.has(word)) matches += 1;
  }

  return matches / sourceWords.size;
}

async function fetchAutocompleteNames(query: string)
{
  if (!query || query.length < 2)
  {
    return [] as string[];
  }

  const response = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`);
  if (!response.ok)
  {
    return [] as string[];
  }

  const data = (await response.json()) as ScryfallAutocompleteResponse;
  return Array.isArray(data.data) ? data.data.slice(0, 10) : [];
}

async function fetchNamedExact(name: string)
{
  const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
  if (!response.ok)
  {
    return null;
  }

  return (await response.json()) as ScryfallCard;
}

async function fetchNamedFuzzy(name: string)
{
  const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
  if (!response.ok)
  {
    return null;
  }

  return (await response.json()) as ScryfallCard;
}

function getCardImageUrl(card: ScryfallCard)
{
  return (
    card.image_uris?.normal ||
    card.image_uris?.large ||
    card.image_uris?.png ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.png ||
    ""
  );
}

async function buildCandidates(titleText: string, typeText: string)
{
  const names = await fetchAutocompleteNames(titleText);
  const exactCards = await Promise.all(names.map((name) => fetchNamedExact(name)));
  const fuzzyCard = titleText.length >= 3 ? await fetchNamedFuzzy(titleText) : null;

  const cardsById = new Map<string, ScryfallCard>();

  for (const card of [...exactCards, fuzzyCard])
  {
    if (!card?.id || !card.name)
    {
      continue;
    }

    cardsById.set(card.id, card);
  }

  return [...cardsById.values()]
    .map((card) =>
    {
      const titleSimilarity = diceCoefficient(titleText, card.name || "");
      const typeSimilarity = typeText ? typeOverlapScore(typeText, card.type_line || "") : 0;

      return {
        id: card.id,
        name: card.name,
        imageUrl: getCardImageUrl(card),
        scryfallUri: card.scryfall_uri || "",
        typeLine: card.type_line || "",
        titleSimilarity,
        typeSimilarity,
        artSimilarity: 0,
        score: titleSimilarity * 0.82 + typeSimilarity * 0.18,
      } satisfies IdentifiedCardCandidate;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function buildSignalsSummary(
  title: CardIdentificationText,
  typeLine: CardIdentificationText,
  candidates: IdentifiedCardCandidate[]
)
{
  const signals: string[] = [];

  if (title.text)
  {
    signals.push(`name signal: ${title.text}`);
  }

  if (typeLine.text)
  {
    signals.push(`type signal: ${typeLine.text}`);
  }

  if (candidates[0]?.name)
  {
    signals.push(`best match: ${candidates[0].name}`);
  }

  return signals.join(" • ");
}

export async function identifyCapturedCard(candidateUrl: string): Promise<CardIdentificationResult>
{
  const loaded = await loadCanvasFromUrl(candidateUrl);
  const titleBandVariants = buildBandVariants(loaded.canvas, TITLE_BAND_CONFIGS);
  const typeBandVariants = buildBandVariants(loaded.canvas, TYPE_BAND_CONFIGS);

  const response = await fetch(`${API_BASE}/api/card-id/identify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      titleBandDataUrl: titleBandVariants[0]?.dataUrl || "",
      typeBandDataUrl: typeBandVariants[0]?.dataUrl || "",
      titleBandDataUrls: titleBandVariants.map((variant) => variant.dataUrl),
      typeBandDataUrls: typeBandVariants.map((variant) => variant.dataUrl),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok)
  {
    throw new Error(payload?.error || "Card OCR failed");
  }

  const title = {
    text: normalizeNameText(String(payload?.title?.text || "")),
    confidence: Number(payload?.title?.confidence || 0),
  } satisfies CardIdentificationText;

  const typeLine = {
    text: normalizeTypeText(String(payload?.typeLine?.text || "")),
    confidence: Number(payload?.typeLine?.confidence || 0),
  } satisfies CardIdentificationText;

  const titleVariantIndex = clampIndex(
    Number(payload?.title?.variantIndex ?? 0),
    titleBandVariants.length
  );
  const typeVariantIndex = clampIndex(
    Number(payload?.typeLine?.variantIndex ?? 0),
    typeBandVariants.length
  );

  const [titleBandUrl, typeBandUrl] = await Promise.all([
    canvasToObjectUrl(titleBandVariants[titleVariantIndex].canvas, "image/png", 0.96),
    canvasToObjectUrl(typeBandVariants[typeVariantIndex].canvas, "image/png", 0.96),
  ]);

  const candidates = title.text.length >= 2
    ? await buildCandidates(title.text, typeLine.text)
    : [];

  const previews: CardIdentificationPreview[] = [
    { label: titleBandVariants[titleVariantIndex].label, url: titleBandUrl },
    { label: typeBandVariants[typeVariantIndex].label, url: typeBandUrl },
  ];

  return {
    previews,
    title,
    typeLine,
    footer: { text: "", confidence: 0 },
    art: null,
    signalsSummary: String(payload?.signalsSummary || buildSignalsSummary(title, typeLine, candidates)),
    candidates,
    objectUrls: previews.map((preview) => preview.url),
  };
}
