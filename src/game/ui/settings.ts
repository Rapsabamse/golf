/** Player settings kept between visits, in this browser only. */

const PREFIX = "golf-setting-";

export function loadSetting(name: string, fallback: boolean): boolean {
    try {
        const value = localStorage.getItem(PREFIX + name);
        return value === null ? fallback : value === "true";
    } catch {
        return fallback;
    }
}

export function saveSetting(name: string, value: boolean) {
    try {
        localStorage.setItem(PREFIX + name, String(value));
    } catch {
        // Storage can be unavailable (private windows); the setting just won't stick
    }
}
