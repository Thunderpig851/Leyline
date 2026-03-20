import * as mediasoupClient from "mediasoup-client";
import { socket } from "./socket";

function emitAcknowledge<TRes>(event: string, payload: any): Promise<TRes>
{
  return new Promise((resolve, reject) =>
  {
    socket.emit(event, payload, (res: any) =>
    {
      if (res?.ok) resolve(res as TRes);
      else reject(new Error(res?.error ?? "request failed"));
    });
  });
}

export async function sfuClient(roomId: string)
{
  const peerId = crypto.randomUUID();

  const joinRes = await emitAcknowledge<{ ok: true; rtpCapabilities: any }>(
    "sfu:join",
    { roomId, peerId }
  );

  const device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: joinRes.rtpCapabilities });

  const sendRes = await emitAcknowledge<{ ok: true; transportOptions: any }>(
    "sfu:createTransport",
    { roomId }
  );

  const recvRes = await emitAcknowledge<{ ok: true; transportOptions: any }>(
    "sfu:createTransport",
    { roomId }
  );

  const sendTransport = device.createSendTransport(sendRes.transportOptions);

  sendTransport.on("connect", ({ dtlsParameters }, callback, errback) =>
  {
    socket.emit(
      "sfu:connectTransport",
      { transportId: sendTransport.id, dtlsParameters },
      (res: any) =>
      {
        if (res?.ok) callback();
        else errback(new Error(res?.error ?? "connect failed"));
      }
    );
  });

  sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) =>
  {
    socket.emit(
      "sfu:produce",
      { roomId, transportId: sendTransport.id, kind, rtpParameters, appData },
      (res: any) =>
      {
        if (res?.ok) callback({ id: res.producerId });
        else errback(new Error(res?.error ?? "produce failed"));
      }
    );
    
  });

  const recvTransport = device.createRecvTransport(recvRes.transportOptions);

  recvTransport.on("connect", ({ dtlsParameters }, callback, errback) =>
  {
    socket.emit(
      "sfu:connectTransport",
      { transportId: recvTransport.id, dtlsParameters },
      (res: any) =>
      {
        if (res?.ok) callback();
        else errback(new Error(res?.error ?? "connection failed"));
      }
    );
  });

  return { peerId, roomId, device, sendTransport, recvTransport };
}

export async function produceTrack(
  sendTransport: mediasoupClient.types.Transport,
  track: MediaStreamTrack,
  appData: any = {}
): Promise<mediasoupClient.types.Producer>
{
  return await sendTransport.produce({ track, appData });
}

export async function consumeTrack(
  roomId: string,
  device: mediasoupClient.types.Device,
  recvTransport: mediasoupClient.types.Transport,
  producerId: string
): Promise<mediasoupClient.types.Consumer>
{
  const res = await emitAcknowledge<{
    ok: true;
    consumerOptions: {
      id: string;
      producerId: string;
      kind: "audio" | "video";
      rtpParameters: any;
      appData: any;
    };
  }>(
    "sfu:consume",
    {
      roomId,
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    }
  );

  const consumer = await recvTransport.consume({
    id: res.consumerOptions.id,
    producerId: res.consumerOptions.producerId,
    kind: res.consumerOptions.kind,
    rtpParameters: res.consumerOptions.rtpParameters,
    appData: res.consumerOptions.appData,
  });

  await emitAcknowledge("sfu:resumeConsumer", { consumerId: consumer.id });
  console.log("resumed consumer", consumer.id, consumer.kind);
  return consumer;
}

export function onNewProducer(
  handler: (data: { peerId: string; producerId: string; kind: "audio" | "video" }) => void
)
{
  socket.on("sfu:newProducer", handler);
  return () => socket.off("sfu:newProducer", handler);
}

export function onConsumerClosed(
  handler: (data: { consumerId: string; producerId?: string }) => void
)
{
  socket.on("sfu:consumerClosed", handler);
  return () => socket.off("sfu:consumerClosed", handler);
}

export function getExistingProducers(roomId: string)
{
  return emitAcknowledge<{ ok: true; producers: { producerId: string; peerId: string; kind: "audio" | "video" }[] }>(
    "sfu:getProducers",
    { roomId }
  );
}