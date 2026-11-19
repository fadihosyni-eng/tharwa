// Shapes of the room state streamed by /api/g/events (see lib/minigames.js publicRoom()).
export type Player = {
  id: string; name: string; avatar: string | null; color: string; isBot: boolean; connected: boolean;
  left: boolean; auto: boolean;
  /** gave up mid-game («انسحاب») and stays in the room as a spectator (left is true too) */
  forfeit?: boolean; username: string | null; points: number | null; seat: number;
};
export type GameEvent = { t: string; pid?: string; seat?: number; [k: string]: any };
export type Room = {
  code: string; game: string; name: string; status: 'lobby' | 'playing' | 'ended'; hostId: string | null; isPrivate: boolean;
  min: number; max: number; opts: { bestOf?: number }; now: number; me: string | null;
  players: Player[]; state: any;
  turn: { pid: string; endsAt: number | null; ms: number } | null;
  result: { winner: string | null; draw: boolean; ranking: string[]; rounds: number; points: Record<string, number> | null } | null;
  rematch: string[]; seq: number; ev: GameEvent[]; chat: { pid: string | null; name: string; text: string; t: number }[];
};
export type Ctx = {
  /** this viewer's player id (null = spectator) */
  me(): string | null;
  /** send a move; resolves false when the server refused it (a toast is shown) */
  act(type: string, data?: Record<string, unknown>): Promise<boolean>;
  sound(name: string): void;
  player(pid: string | null | undefined): Player | undefined;
};
export interface Board {
  /** draw the room; `animate` = play the new events (room.ev) instead of jumping to the end state */
  render(room: Room, animate: boolean): Promise<void> | void;
  /** one short line under "دورك" (e.g. «اضغط النرد») */
  hint?(room: Room): string;
}
