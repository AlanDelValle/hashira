# Contributing to Hashira

Thanks for considering it. This document covers how to get set up, what we expect from a
change, and the few rules that keep the codebase coherent.

Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

See [Running it locally](README.md#running-it-locally) in the README. In short: Herd or
`php artisan serve`, PostgreSQL, `composer install`, `npm install`, `php artisan migrate --seed`,
`npm run dev`.

## Before you open a pull request

```bash
composer lint          # Pint (PHP formatting)
composer analyse       # PHPStan / Larastan
composer test          # Pest (needs a local PostgreSQL: hashira_testing)
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run test           # Vitest
npm run build          # production build must succeed
npm run e2e            # Playwright: one path through the whole application
```

CI runs all of these. A pull request that fails any of them will not be reviewed until it
passes, so it saves everyone time to run them first.

`npm run e2e` starts its own `php artisan serve`, so nothing needs to be running first — but it
serves what `npm run build` produced, so build before you run it. It needs Chromium once
(`npx playwright install chromium`), and it registers an account and saves a drawing for real:
it does that in `hashira_testing`, the database the PHP suite already owns, so it never leaves
junk projects on the dashboard you are drawing in.

The other side of sharing that database: **do not run it at the same time as `composer test`**.
Pest truncates `hashira_testing` between tests, and it will happily do that underneath a
browser halfway through drawing a wall. CI runs the two in separate jobs for the same reason.

## What makes a change easy to merge

- **One concern per pull request.** A refactor bundled with a feature is two reviews wearing
  a trenchcoat.
- **Say what and why in the description.** The diff shows what changed; the description
  should explain the reasoning and any alternative you rejected.
- **Tests where the risk is.** Geometry, snapping, commands and authorization always get a
  test. UI glue usually does not need one.
- **Update the docs in the same PR** if you changed the document format, the API, or an
  architectural decision. Documentation that lags the code is worse than no documentation.

## Code standards

### TypeScript

- `strict` is on. No `any` unless it is at a genuine boundary and carries a comment saying so.
- **The editor core does not import React.** `model/`, `geometry/`, `viewport/`, `commands/`,
  `snapping/` and `export/` are plain TypeScript, testable in Node. If you need React in
  there, the design is wrong — raise it in an issue first.
- **All document mutation goes through a command.** No component writes to the document
  store directly. This is what makes undo/redo correct.
- **All coordinates go through the viewport transform.** No ad-hoc pixel arithmetic in
  components. Storage is millimetres and radians; formatting to metres and degrees happens
  at the UI edge only.
- No magic numbers. Named constants live next to the module that owns them.
- No leftover `console.log`, no commented-out code, no dead exports.

### PHP

- Laravel Pint, default preset. Types on every parameter and return.
- Controllers stay thin: validate with a Form Request, authorize with a Policy, respond with
  a Resource. Real logic goes in a `Domain/*/Actions` class — but only when there _is_ real
  logic. Do not add an action class to wrap a single Eloquent call.
- Never trust request input for ownership. Authorization comes from a policy against the
  authenticated user, always.

### Design

The interface should read as a professional drafting tool. That means restraint: few
colours, one accent used only for selection and active state, subtle borders, very light
shadows, generous space, and typography doing the hierarchy work. Avoid decorative
gradients, glassmorphism, badge clutter, oversized icons and marketing copy inside the
editor.

## Dependencies

Adding a dependency needs a sentence of justification in the pull request. We prefer a
mature library over a hand-rolled implementation when the problem is genuinely hard
(accessibility primitives, PDF writing), and we prefer twenty lines of our own code over a
package when the problem is not (distance from a point to a segment).

## Reporting bugs

Include what you did, what you expected, what happened, your browser and OS, and — if it is
a drawing bug — the exported JSON of the document or a minimal reproduction. A drawing that
misbehaves is much easier to fix when we can load the exact document.

## Security

Please do not open a public issue for a security problem. Email the maintainer instead and
give us a reasonable window to fix it before disclosure.
