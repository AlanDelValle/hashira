import { registerUnderlays } from '@/editor/render/underlay';
import { api, type Envelope } from '@/lib/api';

/**
 * Pages to trace over, on the server.
 *
 * The picture is uploaded once and referred to by id from then on, the same arrangement a
 * block has: a drawing is kilobytes and a rasterised A1 is megabytes, and putting one inside
 * the other would make every autosave carry the survey again.
 */

export interface UnderlaySummary {
    id: string;
    name: string;
    page: number;
    /** The page's own size in millimetres. */
    width: number;
    height: number;
    url: string;
    createdAt: string;
}

/** Every page imported into a project, registered with the renderer as they arrive. */
export async function listUnderlays(projectId: string): Promise<UnderlaySummary[]> {
    const response = await api.get<Envelope<UnderlaySummary[]>>(
        `/api/projects/${projectId}/underlays`,
    );

    registerUnderlays(response.data);

    return response.data;
}

export async function uploadUnderlay(
    projectId: string,
    page: { name: string; page: number; width: number; height: number; image: Blob },
): Promise<UnderlaySummary> {
    const form = new FormData();

    form.set('name', page.name);
    form.set('page', String(page.page));
    form.set('width', String(page.width));
    form.set('height', String(page.height));
    form.set('image', page.image, 'page.png');

    const response = await api.upload<Envelope<UnderlaySummary>>(
        `/api/projects/${projectId}/underlays`,
        form,
    );

    registerUnderlays([response.data]);

    return response.data;
}
