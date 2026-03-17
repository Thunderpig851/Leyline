import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sfuHandshake } from "../lib/sfuHandshake";
import { useGameSession } from "./GameSession";

type MediaStatus = "idle" | "previewing" | "connecting" | "connected" | "error";

type MediaSessionContextType =
{
  status: MediaStatus;
  error: string | null;

  videoInputs: MediaDeviceInfo[];
  audioInputs: MediaDeviceInfo[];

  localStream: MediaStream | null;

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

  toggleCam: () => void;
  toggleMic: () => void;

  connectToSFU: (roomId: string) => Promise<void>;
  disconnectFromSFU: () => void;
};

const MediaSessionContext = createContext<MediaSessionContextType | undefined>(undefined);

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

  const localStreamRef = useRef<MediaStream | null>(null);

  const peerIdRef = useRef<string | null>(null);
  const deviceRef = useRef<any>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);

  const stopPreview = useCallback(() =>
  {
    if (localStreamRef.current)
    {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);

    if (status === "previewing")
    {
      setStatus("idle");
    }
  }, [status]);

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

  const startPreview = useCallback(async () =>
  {
    try
    {
      setError(null);
      stopPreview();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoId ? { deviceId: selectedVideoId } : true,
        audio: selectedAudioId ? { deviceId: selectedAudioId } : true,
      });

      stream.getVideoTracks().forEach((t) => { t.enabled = camEnabled; });
      stream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setStatus("previewing");
    }
    catch (err: any)
    {
      console.error("Failed to start preview:", err);
      setError(err?.message || "Failed to start preview.");
      setStatus("error");
    }
  }, [selectedVideoId, selectedAudioId, camEnabled, micEnabled, stopPreview]);

  const toggleCam = useCallback(() =>
  {
    setCamEnabled((prev) =>
    {
      const next = !prev;
      setPrefs({ camEnabled: next });

      const stream = localStreamRef.current;
      if (stream)
      {
        stream.getVideoTracks().forEach((t) => { t.enabled = next; });
      }

      return next;
    });
  }, [setPrefs]);

  const toggleMic = useCallback(() =>
  {
    setMicEnabled((prev) =>
    {
      const next = !prev;
      setPrefs({ micEnabled: next });

      const stream = localStreamRef.current;
      if (stream)
      {
        stream.getAudioTracks().forEach((t) => { t.enabled = next; });
      }

      return next;
    });
  }, [setPrefs]);

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

  const connectToSFU = useCallback(async (roomId: string) =>
  {
    setStatus("connecting");
    setError(null);

    try
    {
      const { peerId, device, sendTransport, recvTransport } = await sfuHandshake(roomId);

      peerIdRef.current = peerId;
      deviceRef.current = device;
      sendTransportRef.current = sendTransport;
      recvTransportRef.current = recvTransport;

      setPlayer(peerId);
      setStatus("connected");
    }
    catch (err: any)
    {
      console.error("SFU connection failed:", err);
      setError(err?.message || "Failed to connect to SFU.");
      setStatus("error");
      throw err;
    }
  }, [setPlayer]);

  const disconnectFromSFU = useCallback(() =>
  {
    try
    {
      sendTransportRef.current?.close?.();
      recvTransportRef.current?.close?.();
    }
    catch (err)
    {
      console.warn("Error closing transports:", err);
    }

    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    peerIdRef.current = null;

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
    if (!selectedVideoId && !selectedAudioId) return;

    void startPreview();

    return () =>
    {
      stopPreview();
    };
  }, [selectedVideoId, selectedAudioId]);

  const value = useMemo<MediaSessionContextType>(() => ({
    status,
    error,
    videoInputs,
    audioInputs,
    localStream,
    camEnabled,
    micEnabled,
    selectedVideoId,
    selectedAudioId,
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
    camEnabled,
    micEnabled,
    selectedVideoId,
    selectedAudioId,
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