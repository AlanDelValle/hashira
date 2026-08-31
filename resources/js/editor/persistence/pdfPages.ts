/**
 * Turning a PDF into something to trace over.
 *
 * The rasterising happens in the browser, with the same library that renders PDFs everywhere
 * else on the web. On the server it would mean Ghostscript or Imagick installed on every
 * machine that runs this, which is exactly the kind of dependency the project has gone out of
 * its way not to have — and it would mean uploading somebody's survey in full before knowing
 * whether they wanted page 4 of it.
 *
 * pdf.js is around a megabyte and most sessions never import a PDF, so it is imported at the
 * moment somebody asks for one — the same treatment pdf-lib gets on the way out.
 */

/** Dots per inch the page is rasterised at: fine enough to trace, small enough to store. */
const DPI = 150;

const MM_PER_INCH = 25.4;

/** A PDF point is a seventy-second of an inch. */
const MM_PER_POINT = MM_PER_INCH / 72;

export interface PdfPage {
    number: number;
    /** The page's own size in millimetres, so it can be placed at true size. */
    width: number;
    height: number;
}

export interface PdfDocument {
    pages: PdfPage[];
    /** Rasterise one page. The picture is a PNG at `DPI`, ready to upload. */
    render: (pageNumber: number) => Promise<Blob>;
    /** Let go of the parsed document. */
    close: () => void;
}

export async function openPdf(file: File): Promise<PdfDocument> {
    const pdfjs = await import('pdfjs-dist');

    // The worker is bundled alongside the library and addressed as a module URL, so Vite
    // fingerprints it like anything else rather than it being fetched from a CDN at runtime.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url,
    ).toString();

    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({ data });
    const document = await task.promise;

    const pages: PdfPage[] = [];

    for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1 });

        pages.push({
            number,
            width: Math.round(viewport.width * MM_PER_POINT),
            height: Math.round(viewport.height * MM_PER_POINT),
        });
    }

    return {
        pages,

        render: async (pageNumber: number): Promise<Blob> => {
            const page = await document.getPage(pageNumber);
            const viewport = page.getViewport({ scale: DPI / 72 });

            const canvas = window.document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));

            const context = canvas.getContext('2d');

            if (context === null) {
                throw new Error('This browser cannot rasterise a page.');
            }

            // White, because a PDF page is paper and a transparent one traced over a light
            // sheet is a page of grey lines on nothing.
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({ canvas, canvasContext: context, viewport }).promise;

            return new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob === null) {
                        reject(new Error('This browser could not save the page as a picture.'));

                        return;
                    }

                    resolve(blob);
                }, 'image/png');
            });
        },

        close: () => void task.destroy(),
    };
}
