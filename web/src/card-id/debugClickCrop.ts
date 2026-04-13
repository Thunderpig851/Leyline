export type DebugClickCropResult = {
  frameUrl: string;
  roiUrl: string;
  roiImageData: ImageData;
  roiWidth: number;
  roiHeight: number;
  localClickX: number;
  localClickY: number;
};

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode canvas blob'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92) {
  const blob = await canvasToBlob(canvas, type, quality);
  return URL.createObjectURL(blob);
}

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
  const previewMaxWidth = Math.max(320, Math.round(options?.previewMaxWidth ?? 560));

  const rect = videoEl.getBoundingClientRect();
  const sourceWidth = videoEl.videoWidth;
  const sourceHeight = videoEl.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Video metadata is not ready');
  }

  const shortSide = Math.min(sourceWidth, sourceHeight);
  const cropWidth = Math.min(
    sourceWidth,
    Math.max(requestedCropWidth, Math.round(shortSide * 0.6))
  );
  const cropHeight = Math.min(
    sourceHeight,
    Math.max(requestedCropHeight, Math.round(shortSide * 0.82))
  );

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = sourceWidth;
  frameCanvas.height = sourceHeight;

  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
  if (!frameCtx) {
    throw new Error('Could not create frame canvas context');
  }

  frameCtx.drawImage(videoEl, 0, 0, sourceWidth, sourceHeight);

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

  const safeCropWidth = Math.min(cropWidth, sourceWidth);
  const safeCropHeight = Math.min(cropHeight, sourceHeight);
  const halfW = Math.floor(safeCropWidth / 2);
  const halfH = Math.floor(safeCropHeight / 2);

  const sx = clamp(clickX - halfW, 0, Math.max(0, sourceWidth - safeCropWidth));
  const sy = clamp(clickY - halfH, 0, Math.max(0, sourceHeight - safeCropHeight));
  const sw = Math.min(safeCropWidth, sourceWidth - sx);
  const sh = Math.min(safeCropHeight, sourceHeight - sy);

  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = sw;
  roiCanvas.height = sh;

  const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
  if (!roiCtx) {
    throw new Error('Could not create ROI canvas context');
  }

  roiCtx.drawImage(frameCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  frameCtx.strokeStyle = '#00ff99';
  frameCtx.lineWidth = Math.max(3, Math.round(sourceWidth / 420));
  frameCtx.strokeRect(sx, sy, sw, sh);

  frameCtx.fillStyle = '#ff3366';
  frameCtx.beginPath();
  frameCtx.arc(clickX, clickY, Math.max(7, Math.round(sourceWidth / 220)), 0, Math.PI * 2);
  frameCtx.fill();

  const previewScale = Math.min(1, previewMaxWidth / sourceWidth);
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = Math.max(1, Math.round(sourceWidth * previewScale));
  previewCanvas.height = Math.max(1, Math.round(sourceHeight * previewScale));

  const previewCtx = previewCanvas.getContext('2d');
  if (!previewCtx) {
    throw new Error('Could not create preview canvas context');
  }

  previewCtx.imageSmoothingEnabled = true;
  previewCtx.imageSmoothingQuality = 'high';
  previewCtx.drawImage(frameCanvas, 0, 0, previewCanvas.width, previewCanvas.height);

  const [frameUrl, roiUrl] = await Promise.all([
    canvasToObjectUrl(previewCanvas, 'image/jpeg', 0.9),
    canvasToObjectUrl(roiCanvas, 'image/png'),
  ]);

  return {
    frameUrl,
    roiUrl,
    roiImageData: roiCtx.getImageData(0, 0, sw, sh),
    roiWidth: sw,
    roiHeight: sh,
    localClickX: clamp(clickX - sx, 0, sw - 1),
    localClickY: clamp(clickY - sy, 0, sh - 1),
  };
}
