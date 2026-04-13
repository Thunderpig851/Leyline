const router = require("express").Router();

function getOcrServiceUrl()
{
  return String(process.env.OCR_SERVICE_URL || "http://ocr-service:8000").replace(/\/$/, "");
}

router.post("/identify", async (req, res) =>
{
  try
  {
    const titleBandDataUrl = String(req.body?.titleBandDataUrl || "");
    const typeBandDataUrl = String(req.body?.typeBandDataUrl || "");

    if (!titleBandDataUrl || !typeBandDataUrl)
    {
      return res.status(400).json({
        ok: false,
        error: "Missing titleBandDataUrl or typeBandDataUrl",
      });
    }

    console.log(
      "[card-id proxy] title len:",
      titleBandDataUrl.length,
      "type len:",
      typeBandDataUrl.length
    );

    const upstream = await fetch(`${getOcrServiceUrl()}/identify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        titleBandDataUrl,
        typeBandDataUrl,
      }),
    });

    const payload = await upstream.json().catch(() => ({}));

    if (!upstream.ok || !payload?.ok)
    {
      return res.status(503).json({
        ok: false,
        error: payload?.error || "Card OCR service failed",
        errorType: payload?.errorType,
      });
    }

    return res.json(payload);
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

module.exports = router;
