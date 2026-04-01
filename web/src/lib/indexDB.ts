import Dexie, { type EntityTable } from "dexie";

type GameData = 
{
  id: "current";
  roomId: string;
  roomTitle: string;

  selectedVideoId: string | null;
  selectedAudioId: string | null;

  camEnabled: boolean;
  micEnabled: boolean;
  viewerMode?: "player" | "spectator";
}

const gameDataDB = new Dexie("GameData") as Dexie & { gameData: EntityTable<GameData, "id"> };

gameDataDB.version(1).stores(
{
  gameData: "id, roomId, roomTitle, selectedVideoId, selectedAudioId, camEnabled, micEnabled"
});

export type { GameData };
export { gameDataDB };
