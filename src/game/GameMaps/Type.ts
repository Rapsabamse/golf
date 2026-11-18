import * as Phaser from "phaser";
import { Goal } from "./Goal";
import { CourseFeatures } from "./CourseFeatures";

export interface GeneratedMap {
    goal: Goal;

    /** Sand, slopes, ramps, tunnels, windmills and sliding blocks. */
    features: CourseFeatures;

    /** The area the course covers, in world coordinates. */
    bounds: Phaser.Geom.Rectangle;

    /** A ball hit this wall body (bumpers light up). */
    onWallHit(body: MatterJS.BodyType): void;


    /** Call every frame. */
    update(): void;

    getBallSpawnPosition(
        playerIndex: number,
        playerCount: number,
    ): Phaser.Math.Vector2;

    destroy(): void;
}
