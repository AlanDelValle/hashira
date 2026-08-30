# Working in this repository

Hashira is a 2D drafting tool for floor plans: Laravel 13 + PostgreSQL on the back, a React
SPA with a plain-TypeScript editor core on the front. Read
[`docs/architecture.md`](docs/architecture.md) before changing anything structural.

## Environment

Local development uses **Laravel Herd** (PHP 8.4, Nginx, PostgreSQL). The app is served at
`https://hashira.test`. There is no Docker setup and no Laravel Boost in this project — do
not add either, and do not suggest installing them.

```bash
composer install && npm install
php artisan migrate --seed
npm run dev
```

`npm run screenshots` regenerates the README images by driving a headless Chrome against the
running app, signed in as the seeded demo account. Run it whenever the editor's chrome changes
shape, rather than cropping a screenshot by hand.

## Non-negotiable rules

These exist because breaking them is what turns an editor into an unmaintainable one.

1. **The editor core never imports React.** `resources/js/editor/{model,geometry,viewport,commands,snapping,export}`
   is plain TypeScript, runnable in Node, tested without a DOM.
2. **Every document mutation goes through a `Command`.** Nothing writes to the document
   store directly — not a component, not a tool, not a panel. Undo/redo depends on it.
3. **Storage units are millimetres and radians.** `settings.unit` and degrees are display
   concerns, converted only at the UI boundary.
4. **Coordinates convert only through the viewport transform.** No pixel arithmetic inside
   components.
5. **Interaction state is not React state.** Drags, rubber bands and snap previews live in a
   plain object read by the render loop. A drag must cause zero React renders.
6. **Authorization comes from a policy against the authenticated user**, never from request
   input.
7. **The document format is versioned.** Changing its shape requires a `schemaVersion` bump,
   a migration and a fixture test — see [`docs/document-format.md`](docs/document-format.md).
8. **Keyboard shortcuts live in `editor/input/shortcuts.ts`.** The controller dispatches from
   that table, the toolbar labels its buttons from it and the `?` dialog renders it. A key
   added anywhere else is a key nobody can find — which is exactly how the library button came
   to advertise a `B` that did nothing.
9. **Colour is decided by `resources/css/app.css` and policed by `ui/contrast.test.ts`.**
   Components use tokens, never literals, and the audit holds every pair the interface paints
   to WCAG AA. If a token has to be lightened, the pair it breaks has to be dealt with first.

## Checks before calling anything done

```bash
composer lint
composer analyse
composer test
npm run lint
npm run typecheck
npm run test
npm run build
```

## Scope discipline

The MVP scope and everything deliberately excluded are in
[`docs/roadmap.md`](docs/roadmap.md). Do not implement 3D, BIM, DWG/DXF, generative
features, multiplayer or a plugin system. If something seems worth adding, add it to the
roadmap instead of the codebase.

## Design direction

Restrained and technical: neutral greys, one accent used only for selection and active
state, subtle borders, very light shadows, generous whitespace, typography carrying the
hierarchy. No decorative gradients, no glassmorphism, no badge clutter, no marketing copy
inside the editor. If a screen looks like a generic SaaS dashboard template, it is wrong.
