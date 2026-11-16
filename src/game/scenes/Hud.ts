import { Scene } from "phaser";

/**
 * Runs on top of the Game scene and holds the interface. It has its own
 * camera, so zooming the course never moves or scales the interface.
 */
export class Hud extends Scene {
    constructor() {
        super("Hud");
    }

    create() {}
}
