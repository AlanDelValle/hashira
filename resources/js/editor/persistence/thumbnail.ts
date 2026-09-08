import { documentThumbnail } from '@/editor/export';
import { useDocumentStore } from '@/editor/store/documentStore';
import { api } from '@/lib/api';

/**
 * Keeping the projects list's picture of this drawing current.
 *
 * Deliberately not part of autosave, and the reason is one sentence: **nothing about a picture
 * may ever be able to cost somebody their drawing.** It has its own timer, its own request and
 * its own silence — every failure here is swallowed, because the worst case is a card that
 * shows what item 1 already gives it, a line saying A3 · 1:50 · 14 elements.
 *
 * It writes on a long debounce rather than with the save. A save has to be prompt; a picture
 * does not, and rasterising a plan on every burst of edits would be work nobody is waiting for.
 *
 * It also writes once shortly after a drawing is opened. That is what gives a picture to every
 * drawing that existed before this was built, and it is why nothing here has to ask the server
 * whether one is already stored: opening a plan refreshes it, so a preview that is missing or
 * stale repairs itself the next time anybody looks.
 */

/** Long enough that a burst of drawing is over, and nobody is waiting for the result. */
const SETTLE_MS = 20_000;

/** After opening, once the first paint and the first save are well out of the way. */
const ON_OPEN_MS = 4_000;

export class ThumbnailController {
    private projectId: string | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private unsubscribe: (() => void) | null = null;
    private inFlight = false;

    constructor(
        private readonly send: (projectId: string, png: Blob) => Promise<void> = post,
        private readonly draw = documentThumbnail,
    ) {}

    /** Begin keeping this project's picture current. Only ever called where editing is allowed. */
    start(projectId: string): void {
        this.stop();

        this.projectId = projectId;
        this.schedule(ON_OPEN_MS);

        this.unsubscribe = useDocumentStore.subscribe((state, previous) => {
            if (state.document !== previous.document) {
                this.schedule(SETTLE_MS);
            }
        });
    }

    stop(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;

        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.projectId = null;
    }

    private schedule(delay: number): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
        }

        this.timer = setTimeout(() => void this.write(), delay);
    }

    private async write(): Promise<void> {
        this.timer = null;

        const projectId = this.projectId;

        if (projectId === null || this.inFlight) {
            return;
        }

        this.inFlight = true;

        try {
            const png = await this.draw(useDocumentStore.getState().document);

            // An empty sheet has nothing to photograph. The card falls back to what it can say
            // in words, which for a drawing with nothing on it is "nothing drawn yet".
            if (png !== null) {
                await this.send(projectId, png);
            }
        } catch {
            /*
             * Swallowed on purpose, and without a message. A picture that could not be made or
             * could not be sent is not news: the drawing is safe, the save said so, and telling
             * somebody their thumbnail failed is telling them about a thing they never asked
             * for. The next time this drawing is opened, it tries again.
             */
        } finally {
            this.inFlight = false;
        }
    }
}

/**
 * Sent as base64 in a JSON body rather than as a file upload.
 *
 * The server stores base64, so multipart would mean PHP writing a temporary file for something
 * that is decoded and re-encoded on the way past — and a temporary file is a thing that can
 * fail. On the machine this was written on it did, silently, and the pictures simply never
 * appeared until the request was looked at. A few kilobytes of text needs none of that.
 */
async function post(projectId: string, png: Blob): Promise<void> {
    await api.put(`/api/projects/${projectId}/preview`, { preview: await toBase64(png) });
}

function toBase64(png: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(new Error('The picture could not be read back.'));
        reader.onload = () => {
            const url = typeof reader.result === 'string' ? reader.result : '';
            const comma = url.indexOf(',');

            // A data URL, of which only what follows the comma is the picture.
            if (comma === -1) {
                reject(new Error('The picture came back unreadable.'));

                return;
            }

            resolve(url.slice(comma + 1));
        };

        reader.readAsDataURL(png);
    });
}

/** One per tab, like the autosave it deliberately runs beside rather than inside. */
export const thumbnails = new ThumbnailController();
