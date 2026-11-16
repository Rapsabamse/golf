import * as Phaser from "phaser";

/**
 * Shared look of the game's interface: "a putting green in orbit".
 * Navy glass panels that sit on the starfield, one typeface, and fairway
 * green as the only accent (no player ball uses green, so it never reads
 * as a player).
 */
export const COLORS = {
    panel: 0x121a35,
    panelEdge: 0x2c3a66,
    panelHighlight: 0x1d2850,
    text: 0xeef1fb,
    muted: 0x8e9ac0,
    fairway: 0x8fd14f,
    fairwayLight: 0xa6e06a,
    fairwayLip: 0x5e9a2c,
    ink: 0x10260a,
    disabled: 0x48526f,
};

export const CSS = {
    text: "#eef1fb",
    muted: "#8e9ac0",
    fairway: "#8fd14f",
    ink: "#10260a",
};

/** Loaded in the Preloader from public/assets/fonts. */
export const FONTS = {
    regular: '"Adventor", "Avenir Next", "Century Gothic", sans-serif',
    bold: '"Adventor Bold", "Avenir Next", "Century Gothic", sans-serif',
};

/** Type scale (px). */
export const TYPE = {
    small: 14,
    body: 17,
    label: 20,
    title: 30,
    display: 88,
};

export const PANEL_ALPHA = 0.92;
export const RADIUS = 16;
export const MARGIN = 24;

interface TextOptions {
    size?: number;
    bold?: boolean;
    color?: string;
    wrap?: number;
    align?: "left" | "center" | "right";
    lineSpacing?: number;
}

/** All interface text goes through here so it shares one typeface and stays crisp. */
export function addText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    content: string,
    options: TextOptions = {},
): Phaser.GameObjects.Text {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: options.bold ? FONTS.bold : FONTS.regular,
        fontSize: `${options.size ?? TYPE.body}px`,
        color: options.color ?? CSS.text,
        align: options.align ?? "left",
        resolution: Math.min(window.devicePixelRatio || 1, 2),
    };

    if (options.wrap) {
        style.wordWrap = { width: options.wrap, useAdvancedWrap: true };
    }

    const text = scene.add.text(x, y, content, style);

    if (options.lineSpacing !== undefined) {
        text.setLineSpacing(options.lineSpacing);
    }

    return text;
}

/** Navy glass panel with a thin edge. */
export function drawPanel(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius = RADIUS,
    alpha = PANEL_ALPHA,
) {
    graphics.fillStyle(COLORS.panel, alpha);
    graphics.fillRoundedRect(x, y, width, height, radius);
    graphics.lineStyle(1.5, COLORS.panelEdge, 1);
    graphics.strokeRoundedRect(x, y, width, height, radius);
}

/**
 * The hole flag: a pole with a pennant. `x, y` is the foot of the pole.
 */
export function drawPennant(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    height: number,
    flagColor: number,
    poleColor: number,
) {
    const flagHeight = height * 0.42;
    const flagWidth = height * 0.62;
    const top = y - height;

    graphics.lineStyle(Math.max(1.5, height * 0.09), poleColor, 1);
    graphics.lineBetween(x, y, x, top);

    graphics.fillStyle(flagColor, 1);
    graphics.fillTriangle(
        x,
        top,
        x + flagWidth,
        top + flagHeight / 2,
        x,
        top + flagHeight,
    );
}

/** "Bo", "Bo and Cleo", "Bo, Cleo and Dan", "4 players". */
export function joinNames(names: string[]) {
    if (names.length === 0) {
        return "";
    }

    if (names.length === 1) {
        return names[0];
    }

    if (names.length <= 3) {
        return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    }

    return `${names.length} players`;
}
