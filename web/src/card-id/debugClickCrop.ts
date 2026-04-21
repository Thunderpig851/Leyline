export type DebugClickCropResult = {
  roiImageData: ImageData;
  roiWidth: number;
  roiHeight: number;
  localClickX: number;
  localClickY: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function createDebugClickCrop(
  videoEl: HTMLVideoElement,
  clientX: number,
  clientY: number,
  options?: {
    maxDimension?: number;
    cropWidth?: number;
    cropHeight?: number;
    previewMaxWidth?: number;
  }
): Promise<DebugClickCropResult> {
  const requestedCropWidth = Math.max(180, Math.round(options?.cropWidth ?? 560));
  const requestedCropHeight = Math.max(260, Math.round(options?.cropHeight ?? 800));
  const requestedCropSize = Math.max(requestedCropWidth, requestedCropHeight);
  const rect = videoEl.getBoundingClientRect();
  const sourceWidth = videoEl.videoWidth;
  const sourceHeight = videoEl.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Video metadata is not ready');
  }

  const shortSide = Math.min(sourceWidth, sourceHeight);
  const cropSize = Math.min(
    shortSide,
    Math.max(requestedCropSize, Math.round(shortSide * 0.54))
  );

  const clickX = clamp(
    Math.round(((clientX - rect.left) / Math.max(1, rect.width)) * sourceWidth),
    0,
    sourceWidth - 1
  );
  const clickY = clamp(
    Math.round(((clientY - rect.top) / Math.max(1, rect.height)) * sourceHeight),
    0,
    sourceHeight - 1
  );

  const safeCropWidth = Math.min(cropSize, sourceWidth);
  const safeCropHeight = Math.min(cropSize, sourceHeight);
  const halfW = Math.floor(safeCropWidth / 2);
  const halfH = Math.floor(safeCropHeight / 2);

  const sx = clamp(clickX - halfW, 0, Math.max(0, sourceWidth - safeCropWidth));
  const sy = clamp(clickY - halfH, 0, Math.max(0, sourceHeight - safeCropHeight));
  const sw = Math.min(safeCropWidth, sourceWidth - sx);
  const sh = Math.min(safeCropHeight, sourceHeight - sy);
  const localClickX = clamp(clickX - sx, 0, sw - 1);
  const localClickY = clamp(clickY - sy, 0, sh - 1);

  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = sw;
  roiCanvas.height = sh;

  const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
  if (!roiCtx) {
    throw new Error('Could not create ROI canvas context');
  }

  roiCtx.imageSmoothingEnabled = true;
  roiCtx.imageSmoothingQuality = 'high';
  roiCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);
  const roiImageData = roiCtx.getImageData(0, 0, sw, sh);

  return {
    roiImageData,
    roiWidth: sw,
    roiHeight: sh,
    localClickX,
    localClickY,
    sourceX: sx,
    sourceY: sy,
    sourceWidth,
    sourceHeight,
  };
}
