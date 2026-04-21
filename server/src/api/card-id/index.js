const router = require("express").Router();

const SCRYFALL_BASE_URL = "https://api.scryfall.com";
const SCRYFALL_CACHE_TTL_MS = Number(process.env.SCRYFALL_CACHE_TTL_MS || 1000 * 60 * 60 * 12);
const SCRYFALL_NEGATIVE_CACHE_TTL_MS = Number(process.env.SCRYFALL_NEGATIVE_CACHE_TTL_MS || 1000 * 60 * 10);
const OCR_PROXY_TIMEOUT_MS = Number(process.env.OCR_PROXY_TIMEOUT_MS || 15000);
const scryfallCache = new Map();
const scryfallInflight = new Map();

function getOcrServiceUrl()
{
  return String(process.env.OCR_SERVICE_URL || "http://ocr-service:8000").replace(/\/$/, "");
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

function normalizeWhitespace(text)
{
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripTrailingTitleNoise(text)
{
  const normalized = normalizeWhitespace(text);
  if (!/[A-Za-z]{4,}/.test(normalized))
  {
    return normalized;
  }

  const stripped = normalized.replace(/\s+\d{1,3}\s*$/, "").trim();
  return stripped.length >= 4 ? stripped : normalized;
}

function normalizeNameText(text)
{
  return stripTrailingTitleNoise(normalizeWhitespace(
    String(text || "")
      .replace(/[|]/g, "I")
      .replace(/[“”]/g, "\"")
      .replace(/[‘\\’`]/g, "'")
      .replace(/[^A-Za-z0-9 ',:/\-]/g, " ")
  ));
}

const GENERIC_TYPE_TOKENS = new Set([
  "advisor",
  "angel",
  "archer",
  "artifact",
  "assassin",
  "aura",
  "barbarian",
  "basic",
  "battle",
  "bear",
  "beast",
  "berserker",
  "bird",
  "cat",
  "citizen",
  "cleric",
  "construct",
  "creature",
  "demon",
  "devil",
  "dinosaur",
  "dog",
  "dragon",
  "druid",
  "dwarf",
  "elf",
  "elemental",
  "enchantment",
  "equipment",
  "faerie",
  "frog",
  "giant",
  "goblin",
  "human",
  "illusion",
  "instant",
  "knight",
  "land",
  "legendary",
  "merfolk",
  "monk",
  "ogre",
  "pirate",
  "planeswalker",
  "rat",
  "rebel",
  "rogue",
  "samurai",
  "saproling",
  "scout",
  "shaman",
  "skeleton",
  "soldier",
  "spirit",
  "sorcery",
  "thopter",
  "treefolk",
  "vampire",
  "warlock",
  "warrior",
  "wizard",
  "wolf",
  "zombie",
]);

function normalizedWordList(text)
{
  return normalizeNameText(text)
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function genericTypeTokenHits(text)
{
  return normalizedWordList(text).filter((token) => GENERIC_TYPE_TOKENS.has(token)).length;
}

function looksLikeTypeLineText(text)
{
  const normalized = normalizeNameText(text);
  if (!normalized)
  {
    return false;
  }

  if (/\s[-—]\s/.test(String(text || "")))
  {
    return true;
  }

  const tokens = normalizedWordList(normalized);
  if (tokens.length < 2)
  {
    return false;
  }

  const typeHits = genericTypeTokenHits(normalized);
  return typeHits === tokens.length || typeHits >= Math.max(2, Math.ceil(tokens.length * 0.67));
}

function candidateLooksLikeGenericTypeName(card)
{
  const nameTokens = normalizedWordList(card?.name || "");
  if (nameTokens.length < 2)
  {
    return false;
  }

  if (!nameTokens.every((token) => GENERIC_TYPE_TOKENS.has(token)))
  {
    return false;
  }

  const typeTokens = wordSet(card?.type_line || "");
  const mirroredTokenCount = nameTokens.filter((token) => typeTokens.has(token)).length;

  return mirroredTokenCount === nameTokens.length;
}

function isAcceptableCandidateCard(card)
{
  if (!card?.id || !card?.name)
  {
    return false;
  }

  if (candidateLooksLikeGenericTypeName(card))
  {
    return false;
  }

  return true;
}

async function fetchWithTimeout(url, init, timeoutMs)
{
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try
  {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  }
  catch (error)
  {
    if (error?.name === "AbortError")
    {
      const timeoutError = new Error("OCR service timed out");
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  }
  finally
  {
    clearTimeout(timeout);
  }
}

function buildTitleQueries(text)
{
  const normalized = normalizeNameText(text);
  const rawTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const queries = [];
  const seen = new Set();

  const pushQuery = (value) =>
  {
    const normalizedValue = normalizeWhitespace(String(value || "").replace(/[:;|]+/g, " ").trim());
    const key = normalizedValue.toLowerCase();

    if (normalizedValue.length < 2 || seen.has(key))
    {
      return;
    }

    seen.add(key);
    queries.push(normalizedValue);
  };

  pushQuery(normalized);

  const contentTokens = rawTokens.filter((token) => token.length >= 2);
  if (contentTokens.length > 0)
  {
    pushQuery(contentTokens.join(" "));
  }

  if (contentTokens.length > 1 && contentTokens[0].length <= 2)
  {
    pushQuery(contentTokens.slice(1).join(" "));
  }

  if (contentTokens.length > 1 && contentTokens[contentTokens.length - 1].length <= 2)
  {
    pushQuery(contentTokens.slice(0, -1).join(" "));
  }

  for (let start = 0; start < contentTokens.length; start += 1)
  {
    pushQuery(contentTokens.slice(start).join(" "));
  }

  for (let end = contentTokens.length; end > 0; end -= 1)
  {
    pushQuery(contentTokens.slice(0, end).join(" "));
  }

  for (const token of contentTokens)
  {
    if (token.length >= 4)
    {
      pushQuery(token);
    }
  }

  return queries.slice(0, 5);
}

function wordSet(text)
{
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  );
}

function diceCoefficient(a, b)
{
  const left = String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const right = String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const bigrams = new Map();
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

function tokenCoverageScore(sourceText, candidateName)
{
  const sourceTokens = [...wordSet(sourceText)];
  const candidateTokens = [...wordSet(candidateName)];

  if (sourceTokens.length === 0 || candidateTokens.length === 0)
  {
    return 0;
  }

  let matches = 0;

  for (const sourceToken of sourceTokens)
  {
    if (candidateTokens.some((candidateToken) =>
      candidateToken === sourceToken
      || candidateToken.includes(sourceToken)
      || sourceToken.includes(candidateToken)
    ))
    {
      matches += 1;
    }
  }

  return matches / sourceTokens.length;
}

function substringTitleScore(sourceText, candidateName)
{
  const source = String(sourceText || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidate = String(candidateName || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!source || !candidate)
  {
    return 0;
  }

  if (candidate.includes(source) || source.includes(candidate))
  {
    return Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length);
  }

  return 0;
}

function getCardImageUrl(card)
{
  return (
    card?.image_uris?.normal
    || card?.image_uris?.large
    || card?.image_uris?.png
    || card?.card_faces?.[0]?.image_uris?.normal
    || card?.card_faces?.[0]?.image_uris?.large
    || card?.card_faces?.[0]?.image_uris?.png
    || ""
  );
}

function getCardTcgplayerUri(card)
{
  return card?.purchase_uris?.tcgplayer || "";
}

function getCardTcgplayerPrice(card)
{
  const prices = card?.prices || {};
  return prices.usd || prices.usd_foil || prices.usd_etched || "";
}

function scoreCandidate(sourceText, candidateName)
{
  const titleSimilarity = diceCoefficient(sourceText, candidateName || "");
  const tokenCoverage = tokenCoverageScore(sourceText, candidateName || "");
  const substringScore = substringTitleScore(sourceText, candidateName || "");

  return {
    titleSimilarity,
    tokenCoverage,
    substringScore,
    score: titleSimilarity * 0.68 + tokenCoverage * 0.24 + substringScore * 0.08,
  };
}

function mapCardToCandidate(sourceText, card)
{
  const metrics = scoreCandidate(sourceText, card?.name || "");

  return {
    id: card.id,
    name: card.name,
    imageUrl: getCardImageUrl(card),
    scryfallUri: card.scryfall_uri || "",
    tcgplayerUri: getCardTcgplayerUri(card),
    tcgplayerPrice: getCardTcgplayerPrice(card),
    typeLine: card.type_line || "",
    titleSimilarity: metrics.titleSimilarity,
    typeSimilarity: 0,
    score: metrics.score,
  };
}

function buildSignalsSummary({
  titleText,
  candidates,
})
{
  const signals = [];

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

async function fetchScryfallJson(path)
{
  const url = `${SCRYFALL_BASE_URL}${path}`;
  const now = Date.now();
  const cached = scryfallCache.get(url);

  if (cached && cached.expiresAt > now)
  {
    return cached.value;
  }

  const inflight = scryfallInflight.get(url);
  if (inflight)
  {
    return inflight;
  }

  const request = (async () =>
  {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "leyline-card-id/1.0",
      },
    });

    if (response.status === 404)
    {
      scryfallCache.set(url, {
        value: null,
        expiresAt: Date.now() + SCRYFALL_NEGATIVE_CACHE_TTL_MS,
      });
      return null;
    }

    if (response.status === 429)
    {
      const error = new Error("Scryfall rate limited candidate lookup");
      error.status = 429;
      throw error;
    }

    if (!response.ok)
    {
      throw new Error(`Scryfall request failed (${response.status})`);
    }

    const payload = await response.json();
    scryfallCache.set(url, {
      value: payload,
      expiresAt: Date.now() + SCRYFALL_CACHE_TTL_MS,
    });

    return payload;
  })();

  scryfallInflight.set(url, request);

  try
  {
    return await request;
  }
  finally
  {
    scryfallInflight.delete(url);
  }
}

async function fetchAutocompleteNames(query)
{
  if (!query || query.length < 2)
  {
    return [];
  }

  const payload = await fetchScryfallJson(`/cards/autocomplete?q=${encodeURIComponent(query)}`);
  return Array.isArray(payload?.data) ? payload.data.slice(0, 8) : [];
}

async function fetchNamedExact(name)
{
  if (!name || name.length < 2)
  {
    return null;
  }

  return fetchScryfallJson(`/cards/named?exact=${encodeURIComponent(name)}`);
}

async function fetchNamedFuzzy(name)
{
  if (!name || name.length < 3)
  {
    return null;
  }

  return fetchScryfallJson(`/cards/named?fuzzy=${encodeURIComponent(name)}`);
}

async function buildCandidates(titleText)
{
  const normalizedTitle = normalizeNameText(titleText);
  const queries = buildTitleQueries(normalizedTitle);

  if (queries.length === 0 || looksLikeTypeLineText(normalizedTitle))
  {
    return [];
  }

  const directFuzzyCard = await fetchNamedFuzzy(normalizedTitle);
  if (isAcceptableCandidateCard(directFuzzyCard))
  {
    const directCandidate = mapCardToCandidate(normalizedTitle, directFuzzyCard);
    if (directCandidate.score >= 0.72 || directCandidate.titleSimilarity >= 0.82)
    {
      return [directCandidate];
    }
  }

  const autocompleteGroups = await Promise.all(
    queries
      .slice(0, 3)
      .map((query) => fetchAutocompleteNames(query))
  );

  const rankedNames = [...new Set(autocompleteGroups.flat())]
    .map((name) =>
    {
      const metrics = scoreCandidate(normalizedTitle, name);
      return {
        name,
        score: metrics.score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((entry) => entry.name);

  const exactCards = await Promise.all(rankedNames.map((name) => fetchNamedExact(name)));
  const fuzzyCards = await Promise.all(
    queries
      .filter((query) => query.length >= 3)
      .slice(0, 2)
      .map((query) => fetchNamedFuzzy(query))
  );

  const cardsById = new Map();

  for (const card of [directFuzzyCard, ...exactCards, ...fuzzyCards])
  {
    if (!isAcceptableCandidateCard(card))
    {
      continue;
    }

    cardsById.set(card.id, card);
  }

  return [...cardsById.values()]
    .map((card) => mapCardToCandidate(normalizedTitle, card))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function normalizeBandPayload(value)
{
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

router.post("/identify", async (req, res) =>
{
  try
  {
    const titleBandDataUrls = normalizeBandPayload(req.body?.titleBandDataUrls);
    const cardDataUrls = normalizeBandPayload(req.body?.cardDataUrls);
    const typeBandDataUrls = normalizeBandPayload(req.body?.typeBandDataUrls);

    if (titleBandDataUrls.length === 0)
    {
      titleBandDataUrls.push(...normalizeBandPayload(req.body?.titleBandDataUrl));
    }

    if (cardDataUrls.length === 0)
    {
      cardDataUrls.push(...normalizeBandPayload(req.body?.cardDataUrl));
    }

    if (typeBandDataUrls.length === 0)
    {
      typeBandDataUrls.push(...normalizeBandPayload(req.body?.typeBandDataUrl));
    }

    const titleBandDataUrl = titleBandDataUrls[0] || "";
    const typeBandDataUrl = typeBandDataUrls[0] || "";

    if (!titleBandDataUrl)
    {
      return res.status(400).json({
        ok: false,
        error: "Missing titleBandDataUrl",
      });
    }

    console.log(
      "[card-id proxy] title variants:",
      titleBandDataUrls.length,
      "card variants:",
      cardDataUrls.length,
      "type variants:",
      typeBandDataUrls.length,
      "title len:",
      titleBandDataUrl.length,
      "type len:",
      typeBandDataUrl.length
    );

    const upstream = await fetchWithTimeout(
      `${getOcrServiceUrl()}/identify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          titleBandDataUrl,
          typeBandDataUrl,
          titleBandDataUrls,
          cardDataUrl: cardDataUrls[0] || "",
          cardDataUrls,
          typeBandDataUrls,
        }),
      },
      OCR_PROXY_TIMEOUT_MS
    );

    const payload = await upstream.json().catch(() => ({}));

    if (!upstream.ok || !payload?.ok)
    {
      return res.status(503).json({
        ok: false,
        error: payload?.error || "Card OCR service failed",
        errorType: payload?.errorType,
      });
    }

    const normalizedTitle = normalizeNameText(payload?.title?.text || "");
    let candidates = [];

    if (normalizedTitle.length >= 2)
    {
      try
      {
        candidates = await buildCandidates(normalizedTitle);
      }
      catch (candidateError)
      {
        console.warn("[card-id proxy] candidate lookup degraded:", candidateError);
        candidates = [];
      }
    }

    return res.json({
      ...payload,
      title: {
        ...(payload?.title || {}),
        text: normalizedTitle,
        confidence: normalizeConfidence(payload?.title?.confidence),
      },
      candidates,
      signalsSummary: buildSignalsSummary({
        titleText: normalizedTitle,
        candidates,
      }) || String(payload?.signalsSummary || ""),
    });
  }
  catch (error)
  {
    console.error("[card-id proxy] request failed:", error);
    return res.status(503).json({
      ok: false,
      error: error?.message || "Card OCR service unreachable",
    });
  }
});

router.post("/candidates", async (req, res) =>
{
  const titleText = normalizeNameText(req.body?.titleText || "");

  if (titleText.length < 2)
  {
    return res.json({
      ok: true,
      candidates: [],
    });
  }

  try
  {
    const candidates = await buildCandidates(titleText);

    return res.json({
      ok: true,
      candidates,
    });
  }
  catch (error)
  {
    console.error("[card-id proxy] candidate lookup failed:", error);

    return res.status(503).json({
      ok: false,
      error: error?.message || "Card candidate lookup failed",
    });
  }
});

module.exports = router;
