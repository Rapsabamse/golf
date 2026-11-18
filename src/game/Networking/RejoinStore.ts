import { REJOIN_GRACE_MS } from "../../../server/types/types";

/** A game this browser was in, and the key to rejoin it as the same player. */
export interface SavedSession {
    code: string;
    token: string;
    /** Last time we were connected; the server holds a place this long after. */
    savedAt: number;
    /** True for this tab's own game: it may replace a connection still open. */
    takeover?: boolean;
}

/** This tab's game: survives a refresh, belongs to this tab only. */
const TAB_KEY = "golf-tab-session";
/** Every recent game in this browser: lets a new tab pick up a closed one. */
const ALL_KEY = "golf-sessions";

/**
 * Remembers which games this browser is in, so a refresh or a closed tab
 * can rejoin as the same player. Storage can be unavailable (private
 * windows, blocked cookies), so every access is allowed to fail.
 */
export const RejoinStore = {
    save(code: string, token: string) {
        const session: SavedSession = { code, token, savedAt: Date.now() };

        write(sessionStorage, TAB_KEY, session);

        const others = readAll().filter((saved) => saved.token !== token);
        write(localStorage, ALL_KEY, [session, ...others]);
    },

    forget(token: string) {
        if (read<SavedSession>(sessionStorage, TAB_KEY)?.token === token) {
            remove(sessionStorage, TAB_KEY);
        }

        write(
            localStorage,
            ALL_KEY,
            readAll().filter((saved) => saved.token !== token),
        );
    },

    /**
     * Games we could still rejoin, best first: this tab's own game (after a
     * refresh), else the most recent ones from tabs that were closed.
     */
    candidates(): SavedSession[] {
        const fresh = (saved: SavedSession) =>
            Date.now() - saved.savedAt < REJOIN_GRACE_MS;

        const own = read<SavedSession>(sessionStorage, TAB_KEY);
        if (own && fresh(own)) {
            return [{ ...own, takeover: true }];
        }

        return readAll()
            .filter(fresh)
            .sort((a, b) => b.savedAt - a.savedAt);
    },
};

function readAll(): SavedSession[] {
    const all = read<SavedSession[]>(localStorage, ALL_KEY);
    return Array.isArray(all) ? all : [];
}

function read<T>(storage: Storage, key: string): T | undefined {
    try {
        const raw = storage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
        return undefined;
    }
}

function write(storage: Storage, key: string, value: unknown) {
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage unavailable: rejoining just won't be offered
    }
}

function remove(storage: Storage, key: string) {
    try {
        storage.removeItem(key);
    } catch {
        // As above
    }
}
