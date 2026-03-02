import * as mediasoup from "mediasoup";

let worker: mediasoup.types.Worker | null = null;

export async function getWorker(): Promise<mediasoup.types.Worker>
{
  if (worker) return worker;

  worker = await mediasoup.createWorker(
  { 
    logLevel: "warn",
    logTags: ["ice", "dtls", "rtp", "srtp", "rtcp"],
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });

  worker.on("died", () =>
  {
    console.error("Mediasoup worker died, exiting in 2 seconds...");
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

export async function createRouter(): Promise<mediasoup.types.Router>
{
    const w = await getWorker();

    const mediaCodecs: mediasoup.types.RtpCodecCapability[] = 
    [
        {
            kind: "audio",
            mimeType: "audio/opus",
            preferredPayloadType: 100,
            clockRate: 48000,
            channels: 2,
        },
        {
            kind: "video",
            mimeType: "video/VP8",
            preferredPayloadType: 101,
            clockRate: 90000,
            parameters:{}
        }
    ];

    return await w.createRouter({ mediaCodecs });
}

