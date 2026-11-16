import { Scene } from "phaser";
import { MAPS } from "../../../server/types/types";

export class Boot extends Scene {
    constructor() {
        super("Boot");
    }

    preload() {
        //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or background.
        //  The smaller the file size of the assets, the better, as the Boot Scene itself has no preloader.

        //  The sky, grass, walls and cup are all drawn in code
        //  (scenes/Backdrop.ts, GameMaps/CourseArt.ts), so only the maps load here.

        // One map per hole, in play order (see MAPS in server/types/types.ts)
        for (const map of MAPS) {
            this.load.tilemapTiledJSON(map, `assets/maps/${map}.json`);
        }
    }

    create() {
        // The sky stays up behind every other scene from here on
        this.scene.launch("Backdrop");
        this.scene.start("Preloader");
    }
}
