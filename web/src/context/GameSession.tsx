import React,
{
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";

import { gameDataDB } from "../lib/indexDB";

export type GameSessionState =
{
  roomId: string;
  roomTitle: string;
  playerId: string;

  selectedVideoId: string | null;
  selectedAudioId: string | null;

  camEnabled: boolean;
  micEnabled: boolean;
  viewerMode: "player" | "spectator";
};

type GameSessionContextType =
{
  session: GameSessionState;
  isHydrated: boolean;

  setPrefs: (patch: Partial<Omit<GameSessionState, "roomId" | "playerId">>) => void;
  setRoom: (roomId: string, roomTitle: string) => void;
  setPlayer: (playerId: string) => void;
  setViewerMode: (viewerMode: "player" | "spectator") => void;
  reset: () => void;
};

const initialSession: GameSessionState =
{
  roomId: "",
  roomTitle: "",
  playerId: "",

  selectedVideoId: null,
  selectedAudioId: null,

  camEnabled: true,
  micEnabled: true,
  viewerMode: "player",
};

const GameSessionContext = createContext<GameSessionContextType | undefined>(undefined);

export function GameSessionProvider({ children }: { children: React.ReactNode })
{
  const [session, setSession] = useState<GameSessionState>(initialSession);
  const [isHydrated, setIsHydrated] = useState(false);

  const persistSession = useCallback(async (nextSession: GameSessionState) =>
  {
    try
    {
      await gameDataDB.gameData.put({
        id: "current",
        roomId: nextSession.roomId,
        roomTitle: nextSession.roomTitle,
        selectedVideoId: nextSession.selectedVideoId,
        selectedAudioId: nextSession.selectedAudioId,
        camEnabled: nextSession.camEnabled,
        micEnabled: nextSession.micEnabled,
        viewerMode: nextSession.viewerMode,
      });
    }
    catch (error)
    {
      console.error("Failed to persist game session:", error);
    }
  }, []);

  const setPrefs = useCallback((patch: Partial<Omit<GameSessionState, "roomId" | "playerId">>) =>
  {
    setSession((prev) =>
    {
      const nextSession = { ...prev, ...patch };
      void persistSession(nextSession);
      return nextSession;
    });
  }, [persistSession]);

  const setRoom = useCallback((roomId: string, roomTitle: string) =>
  {
    setSession((prev) =>
    {
      const nextSession = { ...prev, roomId, roomTitle };
      void persistSession(nextSession);
      return nextSession;
    });
  }, [persistSession]);

  const setPlayer = useCallback((playerId: string) =>
  {
    setSession((prev) => ({ ...prev, playerId }));
  }, []);

  const setViewerMode = useCallback((viewerMode: "player" | "spectator") =>
  {
    setSession((prev) =>
    {
      const nextSession = { ...prev, viewerMode };
      void persistSession(nextSession);
      return nextSession;
    });
  }, [persistSession]);

  const reset = useCallback(() =>
  {
    setSession(initialSession);

    void gameDataDB.gameData.delete("current").catch((error: unknown) =>
    {
      console.error("Failed to clear persisted game session:", error);
    });
  }, []);

  useEffect(() =>
  {
    let canceled = false;

    async function hydrate()
    {
      try
      {
        const saved = await gameDataDB.gameData.get("current");

        if (saved && !canceled)
        {
          setSession({
            roomId: saved.roomId,
            roomTitle: saved.roomTitle,
            playerId: "",

            selectedVideoId: saved.selectedVideoId,
            selectedAudioId: saved.selectedAudioId,

            camEnabled: saved.camEnabled,
            micEnabled: saved.micEnabled,
            viewerMode: saved.viewerMode === "spectator" ? "spectator" : "player",
          });
        }
      }
      catch (error)
      {
        console.error("Failed to hydrate game session:", error);
      }
      finally
      {
        if (!canceled)
        {
          setIsHydrated(true);
        }
      }
    }

    void hydrate();

    return () =>
    {
      canceled = true;
    };
  }, []);

  const value = useMemo<GameSessionContextType>(() => ({
    session,
    isHydrated,
    setPrefs,
    setRoom,
    setPlayer,
    setViewerMode,
    reset,
  }), [session, isHydrated, setPrefs, setRoom, setPlayer, setViewerMode, reset]);

  return (
    <GameSessionContext.Provider value={value}>
      {children}
    </GameSessionContext.Provider>
  );
}

export function useGameSession(): GameSessionContextType
{
  const context = useContext(GameSessionContext);

  if (!context)
  {
    throw new Error("useGameSession must be used within a GameSessionProvider");
  }

  return context;
}