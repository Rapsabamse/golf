import { Scene } from 'phaser';
import { COLORS } from '../ui/theme';
import { applyUiScale } from '../ui/layout';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        //  Sized to the window (in interface units, see ui/layout.ts)
        const { width, height } = applyUiScale(this);
        const centerX = width / 2;
        const centerY = height / 2;

        //  Starfield behind the loading bar, like the rest of the game
        this.add.tileSprite(centerX, centerY, width, height, 'space');

        //  A thin fairway-green bar on a dark track
        const trackWidth = 320;

        this.add.rectangle(centerX, centerY, trackWidth, 6, COLORS.panel).setAlpha(0.9);

        const bar = this.add.rectangle(centerX - trackWidth / 2, centerY, 0, 6, COLORS.fairway).setOrigin(0, 0.5);

        this.load.on('progress', (progress: number) => {
            bar.width = trackWidth * progress;
        });
    }

    preload ()
    {
        this.load.setPath('assets');

        this.load.image('logo', 'logo.png');
        this.load.image('star', 'star.png');

        //  The interface typeface (TeX Gyre Adventor, GUST Font License)
        this.load.font('Adventor', 'fonts/texgyreadventor-regular.otf', 'opentype');
        this.load.font('Adventor Bold', 'fonts/texgyreadventor-bold.otf', 'opentype');
    }

    create ()
    {
        this.scene.start('MainMenu');
    }
}
