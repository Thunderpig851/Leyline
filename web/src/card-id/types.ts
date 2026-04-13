export type CardPoint = {
  x: number;
  y: number;
};

export type CapturedFrame = {
  imageData: ImageData;
  clickX: number;
  clickY: number;
  width: number;
  height: number;
};

export type CardCropDebugResult = {
  points: CardPoint[];
  cropUrl: string;
  debugFrameUrl: string;
  objectUrls: string[];
  cropWidth: number;
  cropHeight: number;
};
