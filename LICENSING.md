# Licensing

Hashira is under two licences, on purpose.

| What                     | Licence                                              |
| ------------------------ | ---------------------------------------------------- |
| `resources/js/editor/**` | [MIT](resources/js/editor/LICENSE) — the editor core |
| Everything else          | [AGPL-3.0-or-later](LICENSE) — the application       |

Copyright (C) 2026 Alan Del Valle.

This program is free software: you can redistribute it and/or modify it under the terms of
the GNU Affero General Public License as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version. It is distributed in the
hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
License for more details.

## What this means for you

**You want to run it for yourself, or for your office.** Do it. Self-hosting is free and
stays free — there is no edition of Hashira with the drawing tools taken out of it, and
there never will be. You owe nobody anything, including us.

**You want to change it and keep running it privately.** Also fine. The AGPL asks for the
source only when other people use it over a network.

**You want to run it as a service other people use.** Then §13 applies: those people are
entitled to the source of the version you are running, modifications included. That is the
whole point of the licence being AGPL rather than MIT. Hashira's own hosted instance is held
to it too: Phase 10.1 puts the version and the commit it was built from in the footer, linked
to the tag, which is how this repository intends to satisfy §13 for itself.

**You want the drafting engine inside something of your own.** That is what the MIT subtree
is for. `resources/js/editor/**` — the document model, the geometry, the commands, the
snapping, the viewport, the scene and the exporters — is MIT, and you can take it into a
closed product without asking or attributing beyond the licence text.

## Where the boundary actually falls

The MIT subtree is a directory, not a curated list of files, because a boundary you have to
look up is a boundary that drifts. Two honest caveats about lifting it:

- **`resources/js/lib/mark.ts` is not in it.** The PDF exporter imports it, because the mark
  is drawn in the corner of a printed sheet. It is the logo, and a logo is not something to
  hand out under MIT — replace it with your own. It is the only import that leaves the
  subtree from the core modules `AGENTS.md` rule 1 names.
- **`resources/js/editor/react/` is MIT and still not portable.** It is the glue between the
  core and this application's interface, so it imports `@/ui`, `@/lib` and `@/types`, which
  are AGPL. The licence on those files is not a promise that they lift cleanly; the core they
  wrap is.

MIT code may depend on AGPL code. What that produces — the running application — is AGPL as
a whole. The split says what you may take away, not that the two halves are separate
programs.

## Why not one licence

**Not MIT everywhere**, which is what this was until Phase 10. MIT additionally grants the
right to run Hashira as a competing hosted service and give nothing back, and operating it is
the only way this project ever pays for itself. Giving that away is not generosity to users —
they already have every freedom that matters under the AGPL — it is a gift to whoever gets
there with more money.

**Not AGPL everywhere.** The README argued for MIT on the ground that the geometry, document
and command layers should be liftable into somebody else's project without a legal
conversation. That argument was about the core, and it is still right, so the core still has
the permissive licence. A drafting engine that other people can reuse is the most useful
thing this codebase has to offer, and it is not the thing anybody would compete with us
using.

## Contributing

Contributions come in under the [Developer Certificate of Origin](https://developercertificate.org/)
— `git commit -s`, which appends a `Signed-off-by` line saying you have the right to submit
the work. There is no CLA and no copyright assignment: you keep your copyright, and your
contribution is licensed to everybody under whichever of the two licences covers the files
you touched.

That means nobody, including the maintainer, can relicense your contribution or sell an
exception to it later. It is a deliberate trade — see `docs/roadmap.md` §Phase 10 for the
reasoning.

## The name and the mark

The licences cover the code. They are not permission to call your fork Hashira or to ship it
with this project's mark on it, which is why `lib/mark.ts` sits outside the MIT subtree.
