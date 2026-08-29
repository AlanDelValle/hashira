const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/*
 * Pinned to English rather than the browser locale. The interface is not translated, and
 * "Updated há 4 minutos" is worse than either language on its own. When there is real i18n,
 * this reads the active locale instead.
 */
const LOCALE = 'en';

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });

/**
 * "just now", "10 minutes ago", "yesterday" — and a plain date once "N weeks ago" stops
 * being the more useful answer.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
    const then = new Date(iso);
    const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
    const magnitude = Math.abs(seconds);

    if (magnitude < MINUTE) {
        return 'just now';
    }

    if (magnitude < HOUR) {
        return relative.format(Math.round(seconds / MINUTE), 'minute');
    }

    if (magnitude < DAY) {
        return relative.format(Math.round(seconds / HOUR), 'hour');
    }

    if (magnitude < WEEK) {
        return relative.format(Math.round(seconds / DAY), 'day');
    }

    return absolute.format(then);
}
