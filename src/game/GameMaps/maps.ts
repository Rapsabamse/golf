import { COURSES } from "../../../server/types/types";

// The server decides which map is being played and sends its name to the
// clients, so every player is always on the same hole. This is just the
// map loaded behind the lobby before the game starts.
export function getBaseMap() {
    return COURSES[0].holes[0];
}
