import type { CapturedFrame } from './types'

export function captureVideoFrameAtClick(
  videoEl: HTMLVideoElement,
  clientX: number,
  clientY: number,
  maxDimension = 960
): CapturedFrame {
  const rect = videoEl.getBoundingClientRect()

  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    throw new Error('Video metadata is not ready')
  }

  const sourceWidth = videoEl.videoWidth
  const sourceHeight = videoEl.videoHeight

  const scaleToFit =
    Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))

  const width = Math.max(1, Math.round(sourceWidth * scaleToFit))
  const height = Math.max(1, Math.round(sourceHeight * scaleToFit))

  const clickX = Math.max(
    0,
    Math.min(width - 1, Math.round(((clientX - rect.left) / rect.width) * width))
  )

  const clickY = Math.max(
    0,
    Math.min(height - 1, Math.round(((clientY - rect.top) / rect.height) * height))
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create 2D canvas context')
  }

  ctx.drawImage(videoEl, 0, 0, width, height)

  return {
    imageData: ctx.getImageData(0, 0, width, height),
    clickX,
    clickY,
    width,
    height,
  }
}