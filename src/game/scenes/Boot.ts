import { Scene } from "phaser";
import { MAPS } from "../../../server/types/types";

export class Boot extends Scene {
    constructor() {
        super("Boot");
    }

    preload() {
        //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or background.
        //  The smaller the file size of the assets, the better, as the Boot Scene itself has no preloader.

        this.load.image("space", "assets/space.png");
        this.load.image("background", "assets/background.png");
        this.load.image("worldBackground", "assets/worldBackground.jpg");
        this.load.image("goal", "assets/goal.png");

        this.load.image("grass", "assets/tileSet/grass.png");
        // One map per hole, in play order (see MAPS in server/types/types.ts)
        for (const map of MAPS) {
            this.load.tilemapTiledJSON(map, `assets/maps/${map}.json`);
        }
    }

    create() {
        this.scene.start("Preloader");
    }
}
