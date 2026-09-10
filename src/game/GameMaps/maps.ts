let currentMap = -1;

const maps = ["map1", "map2"];

export function getNextMap() {
    currentMap = (currentMap + 1) % maps.length;

    return maps[currentMap];
}
