/**
 * Rendering a chord for the person looking at it.
 *
 * The shortcut table keeps `Mod` abstract because the editor core has no business knowing
 * what it is running on. This is the one place that decides it is a Command key.
 */
const isApple =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export function displayKey(key: string): string {
    if (key !== 'Mod') {
        return key;
    }

    return isApple ? '\u2318' : 'Ctrl';
}

/** A chord as a single string, for a `title` attribute or an `aria-keyshortcuts` value. */
export function formatChord(keys: readonly string[]): string {
    return keys.map(displayKey).join(' ');
}
