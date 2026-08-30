import planUrl from './plan.svg';

/**
 * Not a drawing of the product — a file the product made.
 *
 * `plan.svg` is the seeded sample plan, exported by the editor's own SVG exporter and
 * committed unedited; `npm run artwork` regenerates it from a running instance. It replaced
 * an illustration drawn by hand, which is worth remembering: that illustration advertised a
 * dimension read off the geometry for months before anything in the editor could produce one,
 * and nobody noticed because the picture was not made by the thing it was advertising.
 */
export function PlanDrawing({ className }: { className?: string }) {
    return (
        <img
            src={planUrl}
            className={className}
            alt="A floor plan of a four by four metre bedroom: walls drawn with real thickness, a wardrobe down one wall, a double bed against another, a bookshelf, a window and a door that swings into the room — the room dimensioned 4.000 m each way, the window at 1.200 m and the door at 0.900 m."
        />
    );
}
