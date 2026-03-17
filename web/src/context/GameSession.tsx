import React,
{
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";

import { gameDataDB } from "../lib/indexDb";

export type GameSessionState =
{
  roomId: string;
  roomTitle: string;
  playerId: string;

  selectedVideoId: string | null;
  selectedAudioId: string | null;

  camEnabled: boolean;
  micEnabled: boolean;
};

type GameSessionContextType =
{
  session: GameSessionState;
  isHydrated: boolean;

  setPrefs: (patch: Partial<Omit<GameSessionState, "roomId" | "playerId">>) => void;
  setRoom: (roomId: string, roomTitle: string) => void;
  setPlayer: (playerId: string) => void;
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

  const reset = useCallback(() =>
  {
    setSession(initialSession);

    void gameDataDB.gameData.delete("current").catch((error) =>
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
    reset,
  }), [session, isHydrated, setPrefs, setRoom, setPlayer, reset]);

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