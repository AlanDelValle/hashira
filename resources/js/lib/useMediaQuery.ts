import { useEffect, useState } from 'react';

/**
 * A media query as a boolean, kept in step with the viewport.
 *
 * Tailwind can hide a subtree with a breakpoint class, but hidden is not the same as absent:
 * the editor would still mount its canvas, start a render loop and bind keyboard listeners on
 * a phone that is being told to open it somewhere else.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const list = window.matchMedia(query);
        const update = () => setMatches(list.matches);

        update();
        list.addEventListener('change', update);

        return () => list.removeEventListener('change', update);
    }, [query]);

    return matches;
}
