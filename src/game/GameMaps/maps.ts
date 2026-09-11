let currentMap = -1;

const maps = ["map1", "map2", "map3"];

export function getNextMap() {
    currentMap = (currentMap + 1) % maps.length;

    return maps[currentMap];
}

export function getBaseMap() {
    currentMap = 0;

    return maps[currentMap];
}
