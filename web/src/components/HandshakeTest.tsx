import { useEffect } from "react";
import { sfuHandshake } from "../lib/sfuHandshake";

export function HandshakeTest({ roomId }: { roomId: string })
{
  useEffect(() =>
  {
    // console.log("Starting SFU handshake test for room:", roomId);
    let cancelled = false;

    (async () =>
    {
      try
      {
        const session = await sfuHandshake(roomId);
        if (cancelled) return;
        console.log("SFU handshake OK:", session);
      }
      catch (err)
      {
        if (cancelled) return;
        console.error("SFU handshake FAILED:", err);
      }
    })();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId]);

  return null;
}