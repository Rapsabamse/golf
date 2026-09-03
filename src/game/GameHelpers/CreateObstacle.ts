import * as Phaser from "phaser";

export function createObstacle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
) {
  // Create visual rectangle
  const visual = scene.add.rectangle(x, y, width, height, color);

  // Create physics body
  const body = scene.matter.add.rectangle(x, y, width, height, {
    isStatic: true,
  });

  return {
    visual,
    body,
  };
}
