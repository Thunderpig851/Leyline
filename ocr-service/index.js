import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import express from "express";
import Ocr from "@gutenye/ocr-node";

const PORT = Math.max(1, Number(process.env.PORT || 8000));
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "50mb";
const USE_DIRECTION_CLASSIFY = !["0", "false", "no"].includes(
  String(process.env.GUTEN_OCR_USE_DIRECTION_CLASSIFY || "1").toLowerCase()
);

let ocrPromise = null;

function log(...parts)
{
  console.error(...parts);
}

function getOcr()
{
  if (!ocrPromise)
  {
    ocrPromise = Ocr.create({
      useDirectionClassify: USE_DIRECTION_CLASSIFY,
    }).catch((error) =>
    {
      ocrPromise = null;
      throw error;
    });
  }

  return ocrPromise;
}

function normalizeText(text)
{
  return String(text || "").replace(/\s+/g, " ").trim();
}

function collectDataUrls(value)
{
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function clamp(value, min, max)
{
  return Math.max(min, Math.min(max, value));
}

function normalizeConfidence(value)
{
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 0;
}

function toFiniteNumber(value)
{
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recognitionRank(text, score)
{
  const normalized = normalizeText(text);
  if (!normalized)
  {
    return -1;
  }

  const alnum = Array.from(normalized).filter((char) => /[a-z0-9]/i.test(char)).length;
  const letters = Array.from(normalized).filter((char) => /[a-z]/i.test(char)).length;
  const digits = Array.from(normalized).filter((char) => /\d/.test(char)).length;
  const spaces = Array.from(normalized).filter((char) => /\s/.test(char)).length;
  const allowedPunctuation = Array.from(normalized).filter((char) => "'\",-:/&".includes(char)).length;
  const noise = Math.max(0, normalized.length - alnum - spaces - allowedPunctuation);
  const density = alnum / Math.max(1, normalized.length);
  const digitRatio = digits / Math.max(1, alnum);

  let bonus = Math.min(alnum, 24) * 0.012 + density * 0.08;
  let penalty = noise * 0.06;

  if (alnum < 2)
  {
    penalty += 0.2;
  }

  const lowered = normalized.toLowerCase();
  const suspiciousColorNoise = ["cyan", "magenta", "yellow"];
  if (suspiciousColorNoise.filter((token) => lowered.includes(token)).length >= 2)
  {
    penalty += 0.5;
  }

  if (digits > 0)
  {
    penalty += Math.max(0, digitRatio - 0.16) * 1.1;

    if (letters < 4)
    {
      penalty += 0.16;
    }

    if (/\b\d{2,4}\b/.test(normalized))
    {
      penalty += 0.14;
    }

    if (/[0-9]{2,}\s*$/.test(normalized))
    {
      penalty += 0.18;
    }
  }

  if (/^\d[\d\s/,'"-]*$/.test(normalized))
  {
    penalty += 0.45;
  }

  const typeLineTokens = [
    "creature",
    "artifact",
    "enchantment",
    "instant",
    "sorcery",
    "planeswalker",
    "battle",
    "land",
    "legendary",
    "basic",
    "human",
    "warrior",
    "wizard",
    "cleric",
    "soldier",
    "rogue",
    "scout",
    "equipment",
    "aura",
    "saga",
  ];
  const typeHits = typeLineTokens.filter((token) => lowered.includes(token)).length;
  if (typeHits > 0)
  {
    penalty += Math.min(0.44, typeHits * 0.12);
  }

  if (/\s[-—]\s/.test(normalized))
  {
    penalty += 0.24;
  }

  return score + bonus - penalty;
}

function parseDataUrl(dataUrl)
{
  if (!dataUrl || !dataUrl.includes(","))
  {
    throw new Error("Invalid image payload.");
  }

  const [meta, encoded] = dataUrl.split(",", 2);
  const mime = meta.match(/^data:([^;]+);base64$/i)?.[1] || "image/png";
  return {
    mime,
    buffer: Buffer.from(encoded, "base64"),
  };
}

function extensionForMime(mime)
{
  if (mime === "image/jpeg" || mime === "image/jpg")
  {
    return ".jpg";
  }

  if (mime === "image/webp")
  {
    return ".webp";
  }

  return ".png";
}

async function withTempImageFile(dataUrl, callback)
{
  const { mime, buffer } = parseDataUrl(dataUrl);
  const filename = `leyline-ocr-${crypto.randomUUID()}${extensionForMime(mime)}`;
  const filepath = path.join(os.tmpdir(), filename);

  await fs.writeFile(filepath, buffer);

  try
  {
    return await callback(filepath);
  }
  finally
  {
    await fs.rm(filepath, { force: true }).catch(() => {});
  }
}

function pushRecognizedLines(target, value)
{
  if (!value)
  {
    return;
  }

  if (Array.isArray(value))
  {
    for (const entry of value)
    {
      pushRecognizedLines(target, entry);
    }
    return;
  }

  if (typeof value === "string")
  {
    const text = normalizeText(value);
    if (text)
    {
      target.push({ text, confidence: 0 });
    }
    return;
  }

  if (typeof value === "object")
  {
    if (Array.isArray(value.texts))
    {
      pushRecognizedLines(target, value.texts);
    }

    if (Array.isArray(value.results))
    {
      pushRecognizedLines(target, value.results);
    }

    if (Array.isArray(value.lines))
    {
      pushRecognizedLines(target, value.lines);
    }

    const text = normalizeText(
      value.text ??
      value.value ??
      value.label ??
      value.content ??
      ""
    );

    if (text)
    {
      target.push({
        text,
        confidence: normalizeConfidence(
          value.score ??
          value.confidence ??
          value.probability ??
          value.accuracy ??
          0
        ),
        bounds: extractBounds(value),
      });
    }
  }
}

function extractRecognizedLines(result)
{
  const lines = [];
  pushRecognizedLines(lines, result);
  return lines;
}

function extractBounds(value)
{
  if (!value || typeof value !== "object")
  {
    return null;
  }

  const directLeft = toFiniteNumber(value.left ?? value.x ?? value.x0 ?? value.minX);
  const directTop = toFiniteNumber(value.top ?? value.y ?? value.y0 ?? value.minY);
  const directRight = toFiniteNumber(value.right ?? value.x1 ?? value.maxX);
  const directBottom = toFiniteNumber(value.bottom ?? value.y1 ?? value.maxY);

  if (
    directLeft !== null &&
    directTop !== null &&
    directRight !== null &&
    directBottom !== null
  )
  {
    return {
      left: Math.min(directLeft, directRight),
      top: Math.min(directTop, directBottom),
      right: Math.max(directLeft, directRight),
      bottom: Math.max(directTop, directBottom),
    };
  }

  const maybeRect = value.box ?? value.bbox ?? value.points ?? value.polygon ?? value.bounds;
  if (!maybeRect)
  {
    return null;
  }

  if (Array.isArray(maybeRect) && maybeRect.length === 4 && maybeRect.every((entry) => Number.isFinite(Number(entry))))
  {
    const [x0, y0, x1, y1] = maybeRect.map(Number);
    return {
      left: Math.min(x0, x1),
      top: Math.min(y0, y1),
      right: Math.max(x0, x1),
      bottom: Math.max(y0, y1),
    };
  }

  const points = [];
  for (const point of Array.isArray(maybeRect) ? maybeRect : [])
  {
    if (Array.isArray(point) && point.length >= 2)
    {
      const x = toFiniteNumber(point[0]);
      const y = toFiniteNumber(point[1]);
      if (x !== null && y !== null)
      {
        points.push({ x, y });
      }
      continue;
    }

    if (point && typeof point === "object")
    {
      const x = toFiniteNumber(point.x ?? point.left);
      const y = toFiniteNumber(point.y ?? point.top);
      if (x !== null && y !== null)
      {
        points.push({ x, y });
      }
    }
  }

  if (points.length === 0)
  {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function scoreWholeCardLine(line, lines)
{
  const text = normalizeText(line.text);
  const confidence = normalizeConfidence(line.confidence);
  let score = recognitionRank(text, confidence);

  const words = text.split(/\s+/).filter(Boolean);
  const widthLike = words.length >= 1 && words.length <= 6;
  const lengthLike = text.length >= 4 && text.length <= 32;

  if (widthLike)
  {
    score += 0.12;
  }
  else
  {
    score -= 0.08;
  }

  if (lengthLike)
  {
    score += 0.12;
  }

  if (!/[.!?]/.test(text))
  {
    score += 0.06;
  }

  if (line.bounds)
  {
    const bounded = lines.filter((entry) => entry.bounds);
    const minTop = Math.min(...bounded.map((entry) => entry.bounds.top));
    const maxBottom = Math.max(...bounded.map((entry) => entry.bounds.bottom));
    const maxWidth = Math.max(
      1,
      ...bounded.map((entry) => entry.bounds.right - entry.bounds.left)
    );
    const totalHeight = Math.max(1, maxBottom - minTop);
    const relativeTop = (line.bounds.top - minTop) / totalHeight;
    const widthRatio = (line.bounds.right - line.bounds.left) / maxWidth;
    const height = Math.max(1, line.bounds.bottom - line.bounds.top);
    const aspect = (line.bounds.right - line.bounds.left) / height;

    score += Math.max(0, 1 - relativeTop / 0.42) * 0.34;
    score += Math.min(1, widthRatio) * 0.18;
    score += Math.min(1, aspect / 7) * 0.08;
    score -= Math.max(0, relativeTop - 0.34) * 0.9;
  }

  return score;
}

async function recognizeTitleBandVariant(dataUrl, variantIndex)
{
  return withTempImageFile(dataUrl, async (filepath) =>
  {
    const ocr = await getOcr();
    const result = await ocr.detect(filepath);
    const lines = extractRecognizedLines(result);
    const variantOrderBonus = Math.max(0, 0.08 - variantIndex * 0.012);
    const candidates = lines
      .map((line) =>
      {
        const text = normalizeText(line.text);
        const confidence = normalizeConfidence(line.confidence);

        return {
          text,
          confidence,
          variantIndex,
          sourceKind: "band",
          rank: recognitionRank(text, confidence) + variantOrderBonus,
        };
      })
      .filter((line) => line.text);

    candidates.sort((left, right) => right.rank - left.rank);
    return candidates[0] || {
      text: "",
      confidence: 0,
      variantIndex,
      sourceKind: "band",
      rank: -1,
    };
  });
}

async function recognizeWholeCardVariant(dataUrl, variantIndex)
{
  return withTempImageFile(dataUrl, async (filepath) =>
  {
    const ocr = await getOcr();
    const result = await ocr.detect(filepath);
    const lines = extractRecognizedLines(result).filter((line) => normalizeText(line.text));
    const candidates = lines
      .map((line) =>
      {
        const text = normalizeText(line.text);
        const confidence = normalizeConfidence(line.confidence);

        return {
          text,
          confidence,
          variantIndex,
          sourceKind: "card",
          rank: scoreWholeCardLine({ ...line, text, confidence }, lines),
        };
      })
      .filter((line) => line.text);

    candidates.sort((left, right) => right.rank - left.rank);
    return candidates[0] || {
      text: "",
      confidence: 0,
      variantIndex,
      sourceKind: "card",
      rank: -1,
    };
  });
}

async function identifyPayload(payload)
{
  const titleBandDataUrls = collectDataUrls(payload?.titleBandDataUrls);
  const cardDataUrls = collectDataUrls(payload?.cardDataUrls);
  const typeBandDataUrls = collectDataUrls(payload?.typeBandDataUrls);

  if (titleBandDataUrls.length === 0)
  {
    titleBandDataUrls.push(...collectDataUrls(payload?.titleBandDataUrl));
  }

  if (cardDataUrls.length === 0)
  {
    cardDataUrls.push(...collectDataUrls(payload?.cardDataUrl));
  }

  if (typeBandDataUrls.length === 0)
  {
    typeBandDataUrls.push(...collectDataUrls(payload?.typeBandDataUrl));
  }

  log(
    "[GutenOCR] title variants:",
    titleBandDataUrls.length,
    "card variants:",
    cardDataUrls.length,
    "type variants:",
    typeBandDataUrls.length
  );

  if (titleBandDataUrls.length === 0)
  {
    return {
      status: 400,
      body: {
        ok: false,
        error: "Missing title band payload",
      },
    };
  }

  if ([...titleBandDataUrls, ...typeBandDataUrls].some((dataUrl) => !dataUrl.includes(",")))
  {
    return {
      status: 400,
      body: {
        ok: false,
        error: "Band image payload is not a valid data URL",
      },
    };
  }

  const titleCandidates = await Promise.all(
    titleBandDataUrls.map((dataUrl, variantIndex) => recognizeTitleBandVariant(dataUrl, variantIndex))
  );
  const rankedTitleCandidates = [...titleCandidates].sort((left, right) => right.rank - left.rank);
  const bestTitle = rankedTitleCandidates[0] || {
    text: "",
    confidence: 0,
    variantIndex: 0,
    sourceKind: "band",
  };

  return {
    status: 200,
    body: {
      ok: true,
      title: {
        text: bestTitle.text,
        confidence: bestTitle.confidence,
        variantIndex: bestTitle.variantIndex,
        sourceKind: bestTitle.sourceKind,
      },
      typeLine: {
        text: "",
        confidence: 0,
        variantIndex: 0,
      },
      signalsSummary: `GutenOCR • name: ${bestTitle.text || "—"}`,
    },
  };
}

const app = express();

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

app.get("/health", async (req, res) =>
{
  try
  {
    await getOcr();
    res.status(200).json({ ok: true });
  }
  catch (error)
  {
    res.status(503).json({
      ok: false,
      error: error?.message || "OCR backend unavailable",
    });
  }
});

app.post("/identify", async (req, res) =>
{
  try
  {
    const response = await identifyPayload(req.body || {});
    return res.status(response.status).json(response.body);
  }
  catch (error)
  {
    log("[GutenOCR] identify failed:", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "OCR identify failed",
      errorType: error?.name || "Error",
    });
  }
});

app.use((error, req, res, next) =>
{
  if (error?.type === "entity.too.large")
  {
    return res.status(413).json({
      ok: false,
      error: "Card OCR payload too large",
      errorType: "entity.too.large",
    });
  }

  return next(error);
});

app.use((req, res) =>
{
  res.status(404).json({ ok: false, error: "Not found" });
});

app.listen(PORT, () =>
{
  log(`[GutenOCR] listening on ${PORT}`);
  void getOcr()
    .then(() => log("[GutenOCR] runtime ready"))
    .catch((error) => log("[GutenOCR] runtime warmup failed:", error));
});
