import type { CapturedFrame } from "./types";

type WorkerFrame = {
  pixels: ArrayBuffer;
  pixelOffset: number;
  pixelLength: number;
  width: number;
  height: number;
  clickX: number;
  clickY: number;
};

type DetectRequest = {
  id: number;
  type: "detect";
  frame: WorkerFrame;
  options?: {
    analysisLongSide?: number;
    maxProcessingMs?: number;
  };
};

type WarmupRequest = {
  id: number;
  type: "warmup";
};

type DetectSuccess = {
  id: number;
  ok: true;
  cropBlob: Blob;
  nameBandBlob?: Blob;
  sourceQuad?: Array<{ x: number; y: number }>;
};

type DetectFailure = {
  id: number;
  ok: false;
  error: string;
};

type WarmupSuccess = {
  id: number;
  ok: true;
  warmed: true;
};

type WorkerFailure = DetectFailure;

type WorkerResponse = DetectSuccess | WarmupSuccess | WorkerFailure;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();
const WORKER_WARMUP_TIMEOUT_MS = 60000;
const WORKER_DETECT_TIMEOUT_MS = 20000;
let warmupPromise: Promise<WarmupSuccess> | null = null;

function resetWorker(error?: Error)
{
  if (worker)
  {
    worker.terminate();
    worker = null;
  }

  for (const request of pending.values())
  {
    window.clearTimeout(request.timeoutId);
    if (error)
    {
      request.reject(error);
    }
  }

  pending.clear();
}

function getWorker()
{
  if (worker)
  {
    return worker;
  }

  worker = new Worker("/card-detect-worker.js");
  worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
  {
    const payload = event.data;
    const request = pending.get(payload.id);

    if (!request)
    {
      return;
    }

    pending.delete(payload.id);
    window.clearTimeout(request.timeoutId);

    if (payload.ok)
    {
      request.resolve(payload);
      return;
    }

    request.reject(new Error(payload.error || "OpenCV worker failed"));
  };

  worker.onerror = (event) =>
  {
    const error = new Error(event.message || "OpenCV worker crashed");
    resetWorker(error);
  };

  return worker;
}

function postRequest<TResponse>(
  request: DetectRequest | WarmupRequest,
  transfer: Transferable[] = [],
  timeoutMs: number
): Promise<TResponse>
{
  const currentWorker = getWorker();
  const timeoutId = window.setTimeout(() =>
  {
    const pendingRequest = pending.get(request.id);

    if (!pendingRequest)
    {
      return;
    }

    resetWorker(new Error("OpenCV worker timed out"));
  }, timeoutMs);

  return new Promise<TResponse>((resolve, reject) =>
  {
    pending.set(request.id, { resolve, reject, timeoutId });
    currentWorker.postMessage(request, transfer);
  });
}

export function warmupOpenCvWorker()
{
  if (warmupPromise)
  {
    return warmupPromise;
  }

  const id = nextId++;
  warmupPromise = postRequest<WarmupSuccess>({
    id,
    type: "warmup",
  }, [], WORKER_WARMUP_TIMEOUT_MS).catch((error) =>
  {
    warmupPromise = null;
    throw error;
  });

  return warmupPromise;
}

export async function detectAndRectifyCardInWorker(
  frame: CapturedFrame,
  options?: {
    analysisLongSide?: number;
    maxProcessingMs?: number;
  }
)
{
  const id = nextId++;
  const pixels = new Uint8ClampedArray(frame.imageData.data);
  const requestFrame: WorkerFrame = {
    pixels: pixels.buffer,
    pixelOffset: 0,
    pixelLength: pixels.length,
    width: frame.width,
    height: frame.height,
    clickX: frame.clickX,
    clickY: frame.clickY,
  };
  const request: DetectRequest = {
    id,
    type: "detect",
    frame: requestFrame,
    options,
  };

  await warmupOpenCvWorker();
  return postRequest<DetectSuccess>(request, [requestFrame.pixels], WORKER_DETECT_TIMEOUT_MS);
}
