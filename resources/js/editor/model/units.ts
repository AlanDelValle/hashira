import { normalizeAngle, toDegrees, toRadians } from '@/editor/geometry/angle';

import type { DisplayUnit } from './types';

/**
 * Storage is millimetres. These functions are the only place a display unit exists, so a
 * value read out of the document and a value typed into a field meet in exactly one spot.
 */

const PER_MILLIMETRE: Record<DisplayUnit, number> = {
    mm: 1,
    cm: 0.1,
    m: 0.001,
};

/** Decimals worth showing: a millimetre is the meaningful resolution in every unit. */
const DECIMALS: Record<DisplayUnit, number> = {
    mm: 0,
    cm: 1,
    m: 3,
};

export function toDisplay(millimetres: number, unit: DisplayUnit): number {
    return millimetres * PER_MILLIMETRE[unit];
}

export function fromDisplay(value: number, unit: DisplayUnit): number {
    return value / PER_MILLIMETRE[unit];
}

/** "3.42" — the number alone, for a form field the user is about to edit. */
export function formatLengthValue(millimetres: number, unit: DisplayUnit): string {
    return toDisplay(millimetres, unit).toFixed(DECIMALS[unit]);
}

/** "3.42 m" — the number with its unit, for a readout. */
export function formatLength(millimetres: number, unit: DisplayUnit): string {
    return `${formatLengthValue(millimetres, unit)} ${unit}`;
}

const UNIT_SUFFIX: { suffix: string; unit: DisplayUnit }[] = [
    { suffix: 'mm', unit: 'mm' },
    { suffix: 'cm', unit: 'cm' },
    { suffix: 'm', unit: 'm' },
];

/**
 * Reads a length the way someone actually types one.
 *
 * A bare number is in the document's display unit; an explicit suffix wins over it, so
 * "150mm" means 150 mm even while the drawing is set to metres. Commas are accepted as
 * decimal separators. Returns null for anything that is not a finite length.
 */
export function parseLength(input: string, unit: DisplayUnit): number | null {
    const trimmed = input.trim().toLowerCase().replace(',', '.');

    if (trimmed === '') {
        return null;
    }

    // Longest suffix first, so "mm" is not read as "m" with a stray character.
    const matched = [...UNIT_SUFFIX]
        .sort((a, b) => b.suffix.length - a.suffix.length)
        .find((candidate) => trimmed.endsWith(candidate.suffix));

    const numeric = matched === undefined ? trimmed : trimmed.slice(0, -matched.suffix.length);
    const value = Number(numeric.trim());

    if (numeric.trim() === '' || !Number.isFinite(value)) {
        return null;
    }

    return fromDisplay(value, matched?.unit ?? unit);
}

/** "45°", wrapped to a half turn either way. */
export function formatAngle(radians: number, decimals = 1): string {
    const degrees = toDegrees(normalizeAngle(radians));

    // Avoid "-0.0°" for a value that rounds to zero from below.
    const rounded = Number(degrees.toFixed(decimals)) + 0;

    return `${rounded.toFixed(decimals)}°`;
}

export function parseAngle(input: string): number | null {
    const trimmed = input.trim().replace(',', '.').replace(/°$/, '');
    const value = Number(trimmed);

    if (trimmed === '' || !Number.isFinite(value)) {
        return null;
    }

    return toRadians(value);
}

/** "1:50" */
export function formatScale(scale: number): string {
    return `1:${Math.round(scale)}`;
}

/**
 * An area, in the drawing's display unit.
 *
 * Metres get square metres, which is what a room is quoted in. The other two units have no
 * square anybody says out loud — nobody asks for a 120,000 cm² kitchen — so those are written
 * as the side of the square instead, which at least stays a length a person can picture.
 */
export function formatArea(squareMillimetres: number, unit: DisplayUnit): string {
    return unit === 'm'
        ? `${(squareMillimetres / 1_000_000).toFixed(2)} m²`
        : `${formatLength(Math.sqrt(Math.max(squareMillimetres, 0)), unit)}²`;
}
