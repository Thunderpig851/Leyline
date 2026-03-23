import { Server, Socket } from "socket.io";
import { getOrCreateRoom } from "./rooms";
import type { types as MsTypes } from "mediasoup";

const peerTransports = new Map<string, Map<string, MsTypes.WebRtcTransport>>();
const peerProducers = new Map<string, Map<string, MsTypes.Producer>>();
const peerConsumers = new Map<string, Map<string, MsTypes.Consumer>>();

export function registerSFUSignaling(io: Server): void
{
  io.on("connection", (socket: Socket) =>
  {
    socket.on("sfu:join", async (payload: { roomId: string; peerId: string }, cb) =>
    {
      try
      {
        const { roomId, peerId } = payload;
        const room = await getOrCreateRoom(roomId);

        socket.data.roomId = roomId;
        socket.data.peerId = peerId;

        socket.join(roomId);

        cb({
          ok: true,
          rtpCapabilities: room.router.rtpCapabilities,
        });
      }
      catch (err: any)
      {
        console.error("sfu:join error.", err);
        cb({ ok: false, error: err?.message || "Failed to join SFU room." });
      }
    });

    socket.on("sfu:createTransport", async (payload: { roomId: string }, cb) =>
    {
      try
      {
        const { roomId } = payload;
        const room = await getOrCreateRoom(roomId);

        const transport = await room.router.createWebRtcTransport({
          listenInfos: [
            {
              protocol: "udp",
              ip: "0.0.0.0",
              announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
            },
            {
              protocol: "tcp",
              ip: "0.0.0.0",
              announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
            },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
        });
        const peerTransportMap = getPeerTransportMap(socket.id);
        peerTransportMap.set(transport.id, transport);

        transport.on("dtlsstatechange", (state) =>
        {
          if (state === "closed") transport.close();
        });

        transport.on("@close", () =>
        {
          peerTransportMap.delete(transport.id);
        });

        cb({
          ok: true,
          transportOptions: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
      }
      catch (err: any)
      {
        console.error("sfu:createTransport error.", err);
        cb({ ok: false, error: err?.message || "Failed to create transport." });
      }
    });

    socket.on("sfu:connectTransport", async (
      payload: { transportId: string; dtlsParameters: MsTypes.DtlsParameters },
      cb
    ) =>
    {
      try
      {
        const peerTransportMap = getPeerTransportMap(socket.id);
        const transport = peerTransportMap.get(payload.transportId);

        if (!transport)
        {
          return cb({ ok: false, error: "Transport not found." });
        }

        await transport.connect({ dtlsParameters: payload.dtlsParameters });
        cb({ ok: true });
      }
      catch (err: any)
      {
        console.error("sfu:connectTransport error.", err);
        cb({ ok: false, error: err?.message || "Failed to connect transport." });
      }
    });

    socket.on("sfu:produce", async (
      payload: {
        roomId: string;
        transportId: string;
        kind: "audio" | "video";
        rtpParameters: MsTypes.RtpParameters;
        appData?: any;
      },
      cb
    ) =>
    {
      try
      {
        const peerTransportMap = getPeerTransportMap(socket.id);
        const transport = peerTransportMap.get(payload.transportId);

        if (!transport)
        {
          return cb({ ok: false, error: "Transport not found." });
        }

        const producer = await transport.produce({
          kind: payload.kind,
          rtpParameters: payload.rtpParameters,
          appData: payload.appData ?? {},
        });

        const producerMap = getPeerProducerMap(socket.id);
        producerMap.set(producer.id, producer);

        producer.on("transportclose", () =>
        {
          producerMap.delete(producer.id);
        });

        producer.on("@close", () =>
        {
          producerMap.delete(producer.id);
        });

        socket.to(payload.roomId).emit("sfu:newProducer", {
          producerId: producer.id,
          peerId: socket.data.peerId,
          kind: producer.kind,
          appData: producer.appData,
        });

        cb({ ok: true, producerId: producer.id });
      }
      catch (err: any)
      {
        console.error("sfu:produce error.", err);
        cb({ ok: false, error: err?.message || "Failed to produce." });
      }
    });

    socket.on("sfu:getProducers", async (
      payload: { roomId: string },
      cb
    ) =>
    {
      try
      {
        const producers: { producerId: string; peerId: string; kind: "audio" | "video" }[] = [];

        for (const [socketId, producerMap] of peerProducers.entries())
        {
          const peerSocket = io.sockets.sockets.get(socketId);
          if (!peerSocket) continue;
          if (!peerSocket.rooms.has(payload.roomId)) continue;

          for (const producer of producerMap.values())
          {
            producers.push({
              producerId: producer.id,
              peerId: peerSocket.data.peerId,
              kind: producer.kind,
            });
          }
        }

        cb({ ok: true, producers });
      }
      catch (err: any)
      {
        console.error("sfu:getProducers error.", err);
        cb({ ok: false, error: err?.message || "Failed to get producers." });
      }
    });

    socket.on("sfu:consume", async (
      payload: {
        roomId: string;
        transportId: string;
        producerId: string;
        rtpCapabilities: MsTypes.RtpCapabilities;
      },
      cb
    ) =>
    {
      try
      {
        const room = await getOrCreateRoom(payload.roomId);

        const peerTransportMap = getPeerTransportMap(socket.id);
        const transport = peerTransportMap.get(payload.transportId);

        if (!transport)
        {
          return cb({ ok: false, error: "Receive transport not found." });
        }

        const producer = findProducerById(payload.producerId);

        if (!producer)
        {
          return cb({ ok: false, error: "Producer not found." });
        }

        const canConsume = room.router.canConsume({
          producerId: payload.producerId,
          rtpCapabilities: payload.rtpCapabilities,
        });

        if (!canConsume)
        {
          return cb({ ok: false, error: "Router cannot consume this producer." });
        }

        const consumer = await transport.consume({
          producerId: payload.producerId,
          rtpCapabilities: payload.rtpCapabilities,
          paused: true,
        });

        const consumerMap = getPeerConsumerMap(socket.id);
        consumerMap.set(consumer.id, consumer);

        consumer.on("transportclose", () =>
        {
          consumerMap.delete(consumer.id);
        });

        consumer.on("producerclose", () =>
        {
          consumerMap.delete(consumer.id);

          socket.emit("sfu:consumerClosed", {
            consumerId: consumer.id,
            producerId: payload.producerId,
          });

          consumer.close();
        });

        cb({
          ok: true,
          consumerOptions: {
            id: consumer.id,
            producerId: payload.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            appData: consumer.appData,
          },
        });
      }
      catch (err: any)
      {
        console.error("sfu:consume error.", err);
        cb({ ok: false, error: err?.message || "Failed to consume." });
      }
    });

    socket.on("sfu:resumeConsumer", async (payload: { consumerId: string }, cb) =>
    {
      try
      {
        const consumerMap = getPeerConsumerMap(socket.id);
        const consumer = consumerMap.get(payload.consumerId);

        if (!consumer)
        {
          return cb({ ok: false, error: "Consumer not found." });
        }

        await consumer.resume();
      
        cb({ ok: true });
      }
      catch (err: any)
      {
        console.error("sfu:resumeConsumer error.", err);
        cb({ ok: false, error: err?.message || "Failed to resume consumer." });
      }
    });

    socket.on("disconnect", () =>
    {
      const peerTransportMap = peerTransports.get(socket.id);
      if (peerTransportMap)
      {
        for (const transport of peerTransportMap.values())
        {
          transport.close();
        }
        peerTransports.delete(socket.id);
      }

      const peerProducerMap = peerProducers.get(socket.id);
      if (peerProducerMap)
      {
        for (const producer of peerProducerMap.values())
        {
          producer.close();
        }
        peerProducers.delete(socket.id);
      }

      const peerConsumerMap = peerConsumers.get(socket.id);
      if (peerConsumerMap)
      {
        for (const consumer of peerConsumerMap.values())
        {
          consumer.close();
        }
        peerConsumers.delete(socket.id);
      }
    });
  });
}

function getPeerTransportMap(socketId: string): Map<string, MsTypes.WebRtcTransport>
{
  let peerTransportMap = peerTransports.get(socketId);

  if (!peerTransportMap)
  {
    peerTransportMap = new Map<string, MsTypes.WebRtcTransport>();
    peerTransports.set(socketId, peerTransportMap);
  }

  return peerTransportMap;
}

function getPeerProducerMap(socketId: string): Map<string, MsTypes.Producer>
{
  let producerMap = peerProducers.get(socketId);

  if (!producerMap)
  {
    producerMap = new Map<string, MsTypes.Producer>();
    peerProducers.set(socketId, producerMap);
  }

  return producerMap;
}

function getPeerConsumerMap(socketId: string): Map<string, MsTypes.Consumer>
{
  let consumerMap = peerConsumers.get(socketId);

  if (!consumerMap)
  {
    consumerMap = new Map<string, MsTypes.Consumer>();
    peerConsumers.set(socketId, consumerMap);
  }

  return consumerMap;
}

function findProducerById(producerId: string): MsTypes.Producer | null
{
  for (const producerMap of peerProducers.values())
  {
    const producer = producerMap.get(producerId);
    if (producer) return producer;
  }

  return null;
}