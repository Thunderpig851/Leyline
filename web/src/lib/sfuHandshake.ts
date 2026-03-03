import * as mediasoupClient from "mediasoup-client";
import { socket } from "./socket";

function emitAcknowledge<TRes>(event: string, payload: any): Promise<TRes>
{
    return new Promise((resolve, reject) =>
    {
        socket.emit(event, payload, (res: any) =>
        {
            if (res?.ok) resolve(res as TRes);
            else reject(new Error (res?.error ?? "request failed"));
        });
    });
}

export async function sfuHandshake(roomId: string)
{
    const peerId = crypto.randomUUID;

    const joinRes = await emitAcknowledge<{ok: true, rtpCababilities: any}>("sfu:join", { roomId, peerId });

    const device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: joinRes.rtpCababilities });

    const sendRes = await emitAcknowledge<{ ok: true, transportOptions: any}>("sfu:createTransport", { roomId });
    const recvRes = await emitAcknowledge<{ ok: true, transportOptions: any}>("sfu:createTransport", { roomId });

    const sendTransport = device.createSendTransport(sendRes.transportOptions);

    sendTransport.on("connect", ({ dtlsParameters }, callback, errback) =>
    {
        socket.emit("sfu:connectTransport", { transportId: sendTransport.id, dtlsParameters }, (res: any) =>
        {
            if (res?.ok) callback();
            else errback(new Error(res?.error ?? "connect failed"));
        });
    });

    const recvTransport = device.createRecvTransport(recvRes.transportOptions);

    recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => 
    {
        socket.emit("sfu:connectTransport", {transportId: recvTransport.id, dtlsParameters }, (res: any) =>
        {
            if (res?.ok) callback();
            else errback(new Error(res?.error ?? "conection failed"));
        });
    });

    return { peerId, device, sendTransport, recvTransport };
}