import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { types as mediasoupClientTypes } from "mediasoup-client";
import {
  sfuClient,
  produceTrack,
  consumeTrack,
  onNewProducer,
  onConsumerClosed,
  getExistingProducers,
} from "../lib/sfuClient";
import { getStoredUsername } from "../lib/api";
import { useGameSession } from "./GameSession";

type MediaStatus = "idle" | "previewing" | "connecting" | "connected" | "error";

type RemoteMediaEntry =
{
  peerId: string;
  username?: string | null;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  stream: MediaStream | null;
};

type ConsumerEntry =
{
  consumer: mediasoupClientTypes.Consumer;
  peerId: string;
  kind: "audio" | "video";
};

type MediaSessionContextType =
{
  status: MediaStatus;
  error: string | null;

  selfPeerId: string;

  videoInputs: MediaDeviceInfo[];
  audioInputs: MediaDeviceInfo[];

  localStream: MediaStream | null;
  remoteMedia: Record<string, RemoteMediaEntry>;

  camEnabled: boolean;
  micEnabled: boolean;

  selectedVideoId: string;
  selectedAudioId: string;

  setSelectedVideoId: (deviceId: string) => void;
  setSelectedAudioId: (deviceId: string) => void;

  refreshDevices: () => Promise<void>;
  ensurePermissionAndListDevices: () => Promise<void>;

  startPreview: () => Promise<void>;
  stopPreview: () => void;

  connectToSFU: (roomId: string, options?: { publishLocal?: boolean }) => Promise<void>;
  disconnectFromSFU: () => void;

  toggleCam: () => void;
  toggleMic: () => void;
};

const MediaSessionContext = createContext<MediaSessionContextType | undefined>(undefined);

const HIGH_DETAIL_VIDEO_WIDTH = 2560;
const HIGH_DETAIL_VIDEO_HEIGHT = 1440;

const PREFERRED_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: HIGH_DETAIL_VIDEO_WIDTH },
  height: { ideal: HIGH_DETAIL_VIDEO_HEIGHT },
  aspectRatio: { ideal: 16 / 9 },
  frameRate: { ideal: 30, max: 30 },
};

function clampCapability(value: number | undefined, min: number, max: number)
{
  if (!Number.isFinite(value))
  {
    return max;
  }

  return Math.max(min, Math.min(max, Math.round(value as number)));
}

function buildTrackDetailConstraints(track: MediaStreamTrack): MediaTrackConstraints
{
  const capabilities = typeof track.getCapabilities === "function"
    ? track.getCapabilities()
    : undefined;

  const idealWidth = clampCapability(capabilities?.width?.max, 1280, HIGH_DETAIL_VIDEO_WIDTH);
  const idealHeight = clampCapability(capabilities?.height?.max, 720, HIGH_DETAIL_VIDEO_HEIGHT);

  return {
    width: { ideal: idealWidth },
    height: { ideal: idealHeight },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 30, max: 30 },
  };
}

function buildVideoConstraints(selectedVideoId: string): MediaTrackConstraints | true
{
  if (!selectedVideoId)
  {
    return { ...PREFERRED_VIDEO_CONSTRAINTS };
  }

  return {
    ...PREFERRED_VIDEO_CONSTRAINTS,
    deviceId: { exact: selectedVideoId },
  };
}

function buildAudioConstraints(selectedAudioId: string): MediaTrackConstraints | true
{
  if (!selectedAudioId)
  {
    return true;
  }

  return {
    deviceId: { exact: selectedAudioId },
  };
}

async function tuneVideoTrackForDetail(track: MediaStreamTrack)
{
  track.contentHint = "detail";

  try
  {
    await track.applyConstraints(buildTrackDetailConstraints(track));
  }
  catch (error)
  {
    console.warn("[MediaSession] could not raise video track detail constraints", error);
  }
}

export function MediaSessionProvider({ children }: { children: React.ReactNode })
{
  const { session, setPrefs, setPlayer } = useGameSession();

  const [status, setStatus] = useState<MediaStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);

  const [selectedVideoId, setSelectedVideoIdState] = useState<string>(session.selectedVideoId ?? "");
  const [selectedAudioId, setSelectedAudioIdState] = useState<string>(session.selectedAudioId ?? "");

  const [camEnabled, setCamEnabled] = useState<boolean>(session.camEnabled ?? true);
  const [micEnabled, setMicEnabled] = useState<boolean>(session.micEnabled ?? true);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<Record<string, RemoteMediaEntry>>({});

  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const deviceRef = useRef<mediasoupClientTypes.Device | null>(null);
  const sendTransportRef = useRef<mediasoupClientTypes.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupClientTypes.Transport | null>(null);

  const audioProducerRef = useRef<mediasoupClientTypes.Producer | null>(null);
  const videoProducerRef = useRef<mediasoupClientTypes.Producer | null>(null);

  const consumersRef = useRef<Map<string, ConsumerEntry>>(new Map());

  const newProducerCleanupRef = useRef<(() => void) | null>(null);
  const consumerClosedCleanupRef = useRef<(() => void) | null>(null);

  const refreshDevices = useCallback(async () =>
  {
    const devices = await navigator.mediaDevices.enumerateDevices();

    const vids = devices.filter((d) => d.kind === "videoinput");
    const mics = devices.filter((d) => d.kind === "audioinput");

    setVideoInputs(vids);
    setAudioInputs(mics);

    if (!selectedVideoId || !vids.some((v) => v.deviceId === selectedVideoId))
    {
      const nextVid = vids[0]?.deviceId || "";
      setSelectedVideoIdState(nextVid);
      setPrefs({ selectedVideoId: nextVid });
    }

    if (!selectedAudioId || !mics.some((m) => m.deviceId === selectedAudioId))
    {
      const nextMic = mics[0]?.deviceId || "";
      setSelectedAudioIdState(nextMic);
      setPrefs({ selectedAudioId: nextMic });
    }
  }, [selectedAudioId, selectedVideoId, setPrefs]);

  const ensurePermissionAndListDevices = useCallback(async () =>
  {
    try
    {
      const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      temp.getTracks().forEach((t) => t.stop());
    }
    catch
    {
      console.warn("Permission denied. Device labels may be blank.");
    }

    await refreshDevices();
  }, [refreshDevices]);

  const stopPreview = useCallback(() =>
  {
    if (localStreamRef.current)
    {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setStatus((prev) => (prev === "previewing" ? "idle" : prev));
  }, []);

  const startPreview = useCallback(async () =>
  {
    try
    {
      setError(null);
      stopPreview();

      const stream = await navigator.mediaDevices.getUserMedia(
      {
        video: buildVideoConstraints(selectedVideoId),
        audio: buildAudioConstraints(selectedAudioId),
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack)
      {
        await tuneVideoTrackForDetail(videoTrack);
      }

      stream.getVideoTracks().forEach((t) => { t.enabled = camEnabled; });
      stream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setStatus("previewing");
    }
    catch (err: unknown)
    {
      console.error("[MediaSession] failed to start preview", err);
      setError(err instanceof Error ? err.message : "Failed to start preview.");
      setStatus("error");
    }
  }, [selectedVideoId, selectedAudioId, camEnabled, micEnabled, stopPreview]);

  useEffect(() =>
  {
    const stream = localStreamRef.current;
    if (!stream) return;

    stream.getVideoTracks().forEach((t) => { t.enabled = camEnabled; });
    stream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });
  }, [camEnabled, micEnabled, localStream]);

  const publishLocalTracks = useCallback(async () =>
  {
    if (!sendTransportRef.current || !localStreamRef.current) return;

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    const username = getStoredUsername() || null;

    if (videoTrack && !videoProducerRef.current)
    {
      videoProducerRef.current = await produceTrack(
        sendTransportRef.current,
        videoTrack,
        { mediaTag: "cam", username }
      );
    }

    if (audioTrack && !audioProducerRef.current)
    {
      audioProducerRef.current = await produceTrack(
        sendTransportRef.current,
        audioTrack,
        { mediaTag: "mic", username }
      );
    }
  }, []);

  const attachConsumedTrackToPeer = useCallback((
    peerId: string,
    kind: "audio" | "video",
    track: MediaStreamTrack,
    username?: string | null
  ) =>
  {
    setRemoteMedia((prev) =>
    {
      const existing = prev[peerId] ?? {
        peerId,
        username: username ?? null,
        audioTrack: null,
        videoTrack: null,
        stream: new MediaStream(),
      };

      const stream = existing.stream ?? new MediaStream();

      const alreadyHasTrack = stream.getTracks().some((t) => t.id === track.id);
      if (!alreadyHasTrack)
      {
        stream.addTrack(track);
      }

      return {
        ...prev,
        [peerId]: {
          ...existing,
          username: username ?? existing.username ?? null,
          audioTrack: kind === "audio" ? track : existing.audioTrack,
          videoTrack: kind === "video" ? track : existing.videoTrack,
          stream,
        },
      };
    });
  }, []);

  const removeTrackFromPeer = useCallback((
    peerId: string,
    kind: "audio" | "video",
    track: MediaStreamTrack
  ) =>
  {
    setRemoteMedia((prev) =>
    {
      const existing = prev[peerId];
      if (!existing) return prev;

      const stream = existing.stream ?? new MediaStream();
      const matchingTrack = stream.getTracks().find((t) => t.id === track.id);

      if (matchingTrack)
      {
        stream.removeTrack(matchingTrack);
      }

      const nextEntry: RemoteMediaEntry = {
        ...existing,
        audioTrack: kind === "audio" ? null : existing.audioTrack,
        videoTrack: kind === "video" ? null : existing.videoTrack,
        stream,
      };

      if (!nextEntry.audioTrack && !nextEntry.videoTrack)
      {
        const copy = { ...prev };
        delete copy[peerId];
        return copy;
      }

      return {
        ...prev,
        [peerId]: nextEntry,
      };
    });
  }, []);

  const toggleCam = useCallback(() =>
  {
    const next = !camEnabled;
    setCamEnabled(next);
    setPrefs({ camEnabled: next });

    const stream = localStreamRef.current;
    if (stream)
    {
      stream.getVideoTracks().forEach((t) => { t.enabled = next; });
    }
  }, [camEnabled, setPrefs]);

  const toggleMic = useCallback(() =>
  {
    const next = !micEnabled;
    setMicEnabled(next);
    setPrefs({ micEnabled: next });

    const stream = localStreamRef.current;
    if (stream)
    {
      stream.getAudioTracks().forEach((t) => { t.enabled = next; });
    }
  }, [micEnabled, setPrefs]);

  const setSelectedVideoId = useCallback((deviceId: string) =>
  {
    setSelectedVideoIdState(deviceId);
    setPrefs({ selectedVideoId: deviceId });
  }, [setPrefs]);

  const setSelectedAudioId = useCallback((deviceId: string) =>
  {
    setSelectedAudioIdState(deviceId);
    setPrefs({ selectedAudioId: deviceId });
  }, [setPrefs]);

  const connectToSFU = useCallback(async (
    roomId: string,
    options: { publishLocal?: boolean } = {}
  ) =>
  {
    setStatus("connecting");
    setError(null);

    try
    {
      newProducerCleanupRef.current?.();
      consumerClosedCleanupRef.current?.();

      const { peerId, device, sendTransport, recvTransport } = await sfuClient(roomId);

      roomIdRef.current = roomId;
      peerIdRef.current = peerId;
      setSelfPeerId(peerId);
      deviceRef.current = device;
      sendTransportRef.current = sendTransport;
      recvTransportRef.current = recvTransport;

      newProducerCleanupRef.current = onNewProducer(async (payload: any) =>
      {
        try
        {
          const { peerId, producerId, kind, appData } = payload ?? {};

          if (!peerId || !producerId || !kind) return;
          if (peerId === peerIdRef.current) return;

          const currentRoomId = roomIdRef.current;
          const currentDevice = deviceRef.current;
          const currentRecvTransport = recvTransportRef.current;

          if (!currentRoomId || !currentDevice || !currentRecvTransport) return;

          const consumer = await consumeTrack(
            currentRoomId,
            currentDevice,
            currentRecvTransport,
            producerId
          );

          consumersRef.current.set(consumer.id, {
            consumer,
            peerId,
            kind,
          });

          attachConsumedTrackToPeer(
            peerId,
            kind,
            consumer.track,
            appData?.username ?? null
          );
        }
        catch (err)
        {
          console.error("Failed to consume remote producer:", err);
        }
      });

      consumerClosedCleanupRef.current = onConsumerClosed(({ consumerId }) =>
      {
        const entry = consumersRef.current.get(consumerId);
        if (!entry) return;

        const { consumer, peerId, kind } = entry;

        consumer.close();
        consumersRef.current.delete(consumerId);

        removeTrackFromPeer(peerId, kind, consumer.track);
      });

      const existingProducers: any = await getExistingProducers(roomId);

      for (const { producerId, peerId, kind, appData } of existingProducers.producers ?? [])
      {
        if (peerId === peerIdRef.current) continue;

        try
        {
          const consumer = await consumeTrack(
            roomId,
            device,
            recvTransport,
            producerId
          );

          consumersRef.current.set(consumer.id, {
            consumer,
            peerId,
            kind,
          });

          attachConsumedTrackToPeer(
            peerId,
            kind,
            consumer.track,
            appData?.username ?? null
          );
        }
        catch (err)
        {
          console.error("Failed to consume existing producer:", err);
        }
      }

      if (options.publishLocal !== false)
      {
        await publishLocalTracks();
      }

      setPlayer(peerId);
      setStatus("connected");
    }
    catch (err: unknown)
    {
      console.error("SFU connection failed:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to SFU.");
      setStatus("error");
      throw err;
    }
  }, [attachConsumedTrackToPeer, publishLocalTracks, removeTrackFromPeer, setPlayer]);

  const disconnectFromSFU = useCallback(() =>
  {
    try
    {
      newProducerCleanupRef.current?.();
      consumerClosedCleanupRef.current?.();
      newProducerCleanupRef.current = null;
      consumerClosedCleanupRef.current = null;

      audioProducerRef.current?.close();
      videoProducerRef.current?.close();
      audioProducerRef.current = null;
      videoProducerRef.current = null;

      for (const entry of consumersRef.current.values())
      {
        entry.consumer.close();
      }
      consumersRef.current.clear();

      sendTransportRef.current?.close?.();
      recvTransportRef.current?.close?.();
    }
    catch (err)
    {
      console.warn("Error closing SFU session:", err);
    }

    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    peerIdRef.current = null;
    roomIdRef.current = null;
    setSelfPeerId(null);
    setRemoteMedia({});

    if (status === "connected" || status === "connecting")
    {
      setStatus(localStreamRef.current ? "previewing" : "idle");
    }
  }, [status]);

  useEffect(() =>
  {
    function onDeviceChange()
    {
      void refreshDevices();
    }

    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);

    return () =>
    {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() =>
  {
    if (session.viewerMode === "spectator")
    {
      stopPreview();
      return;
    }

    if (!selectedVideoId && !selectedAudioId) return;

    void startPreview();

    return () =>
    {
      stopPreview();
    };
  }, [selectedVideoId, selectedAudioId, startPreview, stopPreview, session.viewerMode]);

  const value = useMemo<MediaSessionContextType>(() => ({
    status,
    error,
    videoInputs,
    audioInputs,
    localStream,
    remoteMedia,
    camEnabled,
    micEnabled,
    selectedVideoId,
    selectedAudioId,
    selfPeerId: selfPeerId ?? "",
    setSelectedVideoId,
    setSelectedAudioId,
    refreshDevices,
    ensurePermissionAndListDevices,
    startPreview,
    stopPreview,
    toggleCam,
    toggleMic,
    connectToSFU,
    disconnectFromSFU,
  }), [
    status,
    error,
    videoInputs,
    audioInputs,
    localStream,
    remoteMedia,
    camEnabled,
    micEnabled,
    selectedVideoId,
    selectedAudioId,
    selfPeerId,
    setSelectedVideoId,
    setSelectedAudioId,
    refreshDevices,
    ensurePermissionAndListDevices,
    startPreview,
    stopPreview,
    toggleCam,
    toggleMic,
    connectToSFU,
    disconnectFromSFU,
  ]);

  return (
    <MediaSessionContext.Provider value={value}>
      {children}
    </MediaSessionContext.Provider>
  );
}

export function useMediaSession(): MediaSessionContextType
{
  const context = useContext(MediaSessionContext);

  if (!context)
  {
    throw new Error("useMediaSession must be used within a MediaSessionProvider");
  }

  return context;
}
