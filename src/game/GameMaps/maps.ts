let currentMap = 0;
export function getNextMap() {
    if (currentMap > 2) {
        currentMap = 0;
    }

    currentMap++;

    switch (currentMap) {
        case 1:
            return map1;
        case 2:
            return map2;
        case 3:
            return map3;
        default:
            return map0;
    }
}

export const map0 = ["xxxxx", "xs  x", "xs gx", "xxxxx"];

export const map1 = [
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                g             x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "x s                                                              x",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
];

export const map2 = [
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                      xxxxxxxxx                         x",
    "x s                                      x                                 x",
    "x s                                      x                                 x",
    "x s                                      x   g                             x",
    "x s                                      x                                 x",
    "x s                                      x                                 x",
    "x s                                      xxxxxxxxx                         x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "x s                                                                        x",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
];

export const map3 = [
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "x s                                                                        x",
    "x s                    x                                                   x",
    "x s                    x                                                   x",
    "x s                    x                                                   x",
    "x s                    x                 xxx   xxx                         x",
    "x s                                      x       x                         x",
    "x s                         x            x       x                         x",
    "x s                         x            x   g   x                         x",
    "x s                         x            x       x                         x",
    "x s                                      x       x                         x",
    "x s                    x                 xxx   xxx                         x",
    "x s                    x                                                   x",
    "x s                    x                                                   x",
    "x s                    x                                                   x",
    "x s                                                                        x",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
];
