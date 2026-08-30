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
            alt="A floor plan of a six by four metre studio apartment: walls drawn with real thickness, a door with its swing and a window cut into the walls that host them, a bed, a sofa, a round table and a wardrobe, and the overall width and depth dimensioned at 6.000 m and 4.000 m."
        />
    );
}
