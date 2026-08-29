import { ulid } from 'ulid';

/**
 * Identifiers for elements the client creates.
 *
 * ULIDs rather than random ids: they sort by creation time, which makes a document diff
 * readable and gives a stable tie-break wherever two elements would otherwise be equal.
 * Lower-cased to match the ids the server generates.
 */
export function newId(): string {
    return ulid().toLowerCase();
}
