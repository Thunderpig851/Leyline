import { detectAndRectifyCardInWorker } from "./opencvWorkerClient";

export type RefinedCardCropResult = {
  candidateUrl: string;
  nameBandUrl: string;
  statusText: string;
  sourceQuad?: Array<{ x: number; y: number }>;
};

function yieldToBrowser()
{
  return new Promise<void>((resolve) =>
  {
    window.setTimeout(resolve, 0);
  });
}

export async function refineCardCropOpenCv(
  roiImageData: ImageData,
  localClickX: number,
  localClickY: number
): Promise<RefinedCardCropResult | null>
{
  const attempts = [
    { analysisLongSide: 420, maxProcessingMs: 140 },
    { analysisLongSide: 560, maxProcessingMs: 260 },
    { analysisLongSide: 700, maxProcessingMs: 380 },
  ] as const;
  let lastError: unknown = null;
  
  await yieldToBrowser();
  for (const options of attempts)
  {
    try
    {
      const cvResult = await detectAndRectifyCardInWorker({
        imageData: roiImageData,
        clickX: localClickX,
        clickY: localClickY,
        width: roiImageData.width,
        height: roiImageData.height,
      }, options);

      if (!cvResult)
      {
        continue;
      }

      const candidateUrl = URL.createObjectURL(cvResult.cropBlob);
      const nameBandUrl = cvResult.nameBandBlob
        ? URL.createObjectURL(cvResult.nameBandBlob)
        : "";

      if (!candidateUrl)
      {
        continue;
      }

      return {
        candidateUrl,
        nameBandUrl,
        statusText: "OpenCV multi-pass edge-locked candidate",
        sourceQuad: cvResult.sourceQuad,
      };
    }
    catch (error)
    {
      lastError = error;
      await yieldToBrowser();
    }
  }

  if (lastError)
  {
    console.warn("OpenCV edge lock failed", lastError);
  }

  return null;
}
