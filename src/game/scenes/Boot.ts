import { Scene } from "phaser";

export class Boot extends Scene {
    constructor() {
        super("Boot");
    }

    preload() {
        //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or background.
        //  The smaller the file size of the assets, the better, as the Boot Scene itself has no preloader.

        this.load.image("background", "assets/background.png");
        this.load.image("worldBackground", "assets/worldBackground.jpg");
        this.load.image("goal", "assets/goal.png");

        this.load.image("grass", "assets/tileSet/grass.png");
        this.load.tilemapTiledJSON("map1", "assets/maps/map1.json");
        this.load.tilemapTiledJSON("map2", "assets/maps/map2.json");
        this.load.tilemapTiledJSON("map3", "assets/maps/map3.json");
    }

    create() {
        this.scene.start("Preloader");
    }
}
