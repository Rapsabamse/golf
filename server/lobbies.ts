import { ServerContext, createServerContext } from "./serverState";
import { DEFAULT_CATCHPHRASES } from "./types/types";

/** Letters for lobby codes. */
const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_LENGTH = 4;
const MAX_NAME_LENGTH = 16;
const MAX_CATCHPHRASE_LENGTH = 24;


/** Every running lobby, by its code. Each one is a separate game. */
const lobbies = new Map<string, ServerContext>();

/** Makes a new lobby with a code no other lobby is using. */
export function createLobby(): ServerContext {
    let code: string;

    do {
        code = Array.from(
            { length: CODE_LENGTH },
            () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)],
        ).join("");
    } while (lobbies.has(code));

    const lobby = createServerContext(code);
    lobbies.set(code, lobby);

    console.log(`Lobby ${code} created (${lobbies.size} running)`);
    return lobby;
}

export function findLobby(code: string): ServerContext | undefined {
    return lobbies.get(normalizeCode(code));
}

/** Closes a lobby once its last player has left. */
export function removeLobbyIfEmpty(lobby: ServerContext) {
    if (lobby.players.size === 0 && lobbies.get(lobby.code) === lobby) {
        lobbies.delete(lobby.code);
        console.log(`Lobby ${lobby.code} closed (${lobbies.size} running)`);
    }
}

/** "xk li" → "XKLI": codes are typed by people, so be forgiving. */
export function normalizeCode(code: string) {
    return code.toUpperCase().replace(/[^A-Z]/g, "");
}

/** The player's own catchphrase, or a random one if they didn't pick one. */
export function cleanCatchphrase(catchphrase: unknown): string {
    const cleaned =
        typeof catchphrase === "string"
            ? catchphrase
                  .replace(/[\u0000-\u001f\u007f]/g, "")
                  .trim()
                  .slice(0, MAX_CATCHPHRASE_LENGTH)
            : "";

    return (
        cleaned ||
        DEFAULT_CATCHPHRASES[
            Math.floor(Math.random() * DEFAULT_CATCHPHRASES.length)
        ]
    );
}

export function cleanName(name: unknown): string {
    const cleaned =
        typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
    return cleaned || "Player";
}
