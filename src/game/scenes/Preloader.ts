import { Scene } from 'phaser';
import { COLORS } from '../ui/theme';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        //  Starfield behind the loading bar, like the rest of the game
        this.add.tileSprite(centerX, centerY, this.scale.width, this.scale.height, 'space');

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
