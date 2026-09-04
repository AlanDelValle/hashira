import type { CommandEnvelope } from '@/editor/commands/envelope';
import { api, type Envelope } from '@/lib/api';

/**
 * The edit log, over HTTP.
 *
 * **Posting is the write.** An edit is in the log, with its number, before anybody else hears
 * about it — the broadcast that follows is only delivery. That is what makes a socket being
 * down cost people seeing each other work rather than costing them the work.
 *
 * Reading is how somebody who opened the drawing a minute late catches up: the snapshot they
 * loaded carries the sequence it was written at, and everything after it is here.
 */

export interface RecordedOperation {
    sequence: number;
    /** Which browser sent it, so that browser can skip its own echo. */
    origin: string;
    envelope: unknown;
}

export function sendOperation(
    projectId: string,
    envelope: CommandEnvelope,
    origin: string,
): Promise<RecordedOperation> {
    return api
        .post<Envelope<RecordedOperation>>(`/api/projects/${projectId}/operations`, {
            envelope,
            origin,
        })
        .then((response) => response.data);
}

export function fetchOperationsAfter(
    projectId: string,
    after: number,
): Promise<RecordedOperation[]> {
    return api
        .get<Envelope<RecordedOperation[]>>(`/api/projects/${projectId}/operations?after=${after}`)
        .then((response) => response.data);
}
