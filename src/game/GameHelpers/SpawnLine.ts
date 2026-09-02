import * as Phaser from "phaser";

export class SpawnLine {
    constructor(
        public start: Phaser.Math.Vector2,
        public end: Phaser.Math.Vector2,
    ) {}

    getPosition(playerIndex: number, playerCount: number): Phaser.Math.Vector2 {
        const t = (playerIndex + 0.5) / playerCount;

        return new Phaser.Math.Vector2(
            Phaser.Math.Linear(this.start.x, this.end.x, t),
            Phaser.Math.Linear(this.start.y, this.end.y, t),
        );
    }
}
