import { api, type Envelope } from '@/lib/api';
import type { Mention } from '@/types/api';

/**
 * The remarks you were named in.
 *
 * Every request is scoped to the signed-in account by the server, so there is no id to pass
 * and no way to ask about somebody else's.
 */
export function fetchMentions(): Promise<Mention[]> {
    return api.get<Envelope<Mention[]>>('/api/mentions').then((response) => response.data);
}

export function markMentionRead(id: string): Promise<void> {
    return api.patch(`/api/mentions/${id}`);
}

export function markAllMentionsRead(): Promise<void> {
    return api.patch('/api/mentions');
}
