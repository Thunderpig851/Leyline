import React, { createContext, useContext, useMemo, useState, useCallback } from "react";

export type GameSessionState =
{
  roomId: string;
  roomTitle?: string;
  playerId: string;

  selectedVideoId: string | null;
  selectedAudioId: string | null;

  camEnabled: boolean;
  micEnabled: boolean;
};

type GameSessionContextType =
{
  session: GameSessionState;

  setPrefs: (patch: Partial<Omit<GameSessionState, "roomId" | "playerId">>) => void;

  setRoom: (roomId: string, roomTitle?: string) => void;
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

  // Keep useCallback to avoid unnecessary re-renders of components consuming the context
  const setPrefs = useCallback((patch: Partial<Omit<GameSessionState, "roomId" | "playerId">>) =>
  {
    setSession((prev) => ({ ...prev, ...patch }));
  }, []);

  const setRoom = useCallback((roomId: string, roomTitle?: string) =>
  {
    setSession((prev) => ({ ...prev, roomId, roomTitle }));
  }, []);

  const setPlayer = useCallback((playerId: string) =>
  {
    setSession((prev) => ({ ...prev, playerId }));
  }, []);

  const reset = useCallback(() =>
  {
    setSession(initialSession);
  }, []);

  const value = useMemo<GameSessionContextType>(() =>
  ({
    session,
    setPrefs,
    setRoom,
    setPlayer,
    reset,
  }), [session, setPrefs, setRoom, setPlayer, reset]);

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