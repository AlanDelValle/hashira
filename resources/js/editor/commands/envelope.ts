import { z } from 'zod';

import {
    elementSchema,
    layerSchema,
    mergeSettings,
    parseDocument,
    sheetSchema,
} from '@/editor/model/document';
import type {
    DocumentSettings,
    Element,
    HashiraDocument,
    Layer,
    Sheet,
} from '@/editor/model/types';

import {
    addElements,
    combine,
    deleteElements,
    replaceDocument,
    replaceElements,
    replaceLayers,
    replaceSettings,
    replaceSheets,
    type Command,
} from './command';

/**
 * An edit, as plain JSON, and the one way of turning one back into a command.
 *
 * A command is a closure, which is exactly what cannot cross a process boundary. Live
 * co-editing has to send one down a socket; a plugin in a sandbox has to send one through a
 * message port. Both need the same thing, so it is built once, here, rather than twice later.
 *
 * **Everything is described by state, never by intent.** An envelope says "these elements
 * become those", not "move this by 200 mm". That is what the commands already are — `execute`
 * and `undo` are pure functions of captured state — and turning them into intents would be a
 * redesign of the command layer wearing a serialisation costume. It also means the receiving
 * end never has to re-derive anything, and two editors that disagree resolve to whichever
 * state arrived last, per element, which is a rule you can explain to somebody.
 *
 * **There is one way in, and it validates.** `parseCommand` is the only export that produces a
 * `Command`, and it is a parser rather than a cast: an envelope is by definition something
 * that came from elsewhere, and a second, trusting entry point would be used on wire data by
 * the third person who reads this file. The schemas are the document's own, so an element in
 * a command is held to exactly what an element in a drawing is held to.
 */

export type CommandEnvelope =
    | { type: 'addElements'; label: string; elements: Element[] }
    | { type: 'deleteElements'; label: string; ids: string[] }
    | {
          type: 'replaceElements';
          label: string;
          coalesceKey: string | null;
          before: Element[];
          after: Element[];
      }
    | { type: 'replaceLayers'; label: string; before: Layer[]; after: Layer[] }
    | { type: 'replaceSheets'; label: string; before: Sheet[]; after: Sheet[] }
    | {
          type: 'replaceSettings';
          label: string;
          before: DocumentSettings;
          after: DocumentSettings;
      }
    | {
          type: 'replaceDocument';
          label: string;
          before: HashiraDocument;
          after: HashiraDocument;
      }
    | { type: 'combine'; label: string; commands: CommandEnvelope[] };

export type ParsedCommand = { ok: true; command: Command } | { ok: false; reason: string };

/**
 * Read an envelope from anywhere and turn it into a command, or say why it is not one.
 *
 * All-or-nothing, unlike a document. A drawing with one unreadable element is still a drawing
 * and opens without it; an edit with one unreadable element is an edit that would do something
 * other than what it says, and there is no half of it worth running.
 */
export function parseCommand(raw: unknown): ParsedCommand {
    const parsed = envelopeSchema.safeParse(raw);

    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue === undefined ? '' : issue.path.join('.');

        return {
            ok: false,
            reason:
                issue === undefined
                    ? 'This is not an edit.'
                    : `This is not an edit: ${path === '' ? issue.message : `${path} ${issue.message}`}.`,
        };
    }

    return { ok: true, command: build(parsed.data) };
}

function build(envelope: CommandEnvelope): Command {
    switch (envelope.type) {
        case 'addElements':
            return addElements(envelope.elements, envelope.label);

        case 'deleteElements':
            return deleteElements(envelope.ids, envelope.label);

        case 'replaceElements':
            return replaceElements(
                envelope.before,
                envelope.after,
                envelope.label,
                envelope.coalesceKey,
            );

        case 'replaceLayers':
            return replaceLayers(envelope.before, envelope.after, envelope.label);

        case 'replaceSheets':
            return replaceSheets(envelope.before, envelope.after, envelope.label);

        case 'replaceSettings':
            return replaceSettings(envelope.before, envelope.after, envelope.label);

        case 'replaceDocument':
            return replaceDocument(envelope.before, envelope.after, envelope.label);

        case 'combine':
            return combine(envelope.label, envelope.commands.map(build));
    }
}

/*
 * A label is what the undo button says, so it is bounded: an edit arriving from elsewhere does
 * not get to write a paragraph into somebody's history menu.
 */
const labelSchema = z.string().min(1).max(120);

/**
 * Settings go through the document's own merge rather than a schema of their own.
 *
 * `mergeSettings` fills every field a drawing needs from the defaults, so a sender running an
 * older build cannot leave this one holding settings with a hole in them. It is the same
 * treatment settings get when a document is opened, which is the point.
 */
const settingsSchema = z.unknown().transform((raw) => mergeSettings(raw, ''));

/**
 * A whole drawing inside an envelope is read by the document parser, migrations and all — so a
 * restore sent from a build one schema behind arrives as a drawing this one can hold.
 */
const documentSchema = z.unknown().transform((raw, context) => {
    const result = parseDocument(raw);

    if (!result.ok) {
        context.addIssue({ code: 'custom', message: result.reason });

        return z.NEVER;
    }

    return result.document;
});

const envelopeSchema: z.ZodType<CommandEnvelope> = z.lazy(() =>
    z.discriminatedUnion('type', [
        z.object({
            type: z.literal('addElements'),
            label: labelSchema,
            elements: z.array(elementSchema),
        }),
        z.object({
            type: z.literal('deleteElements'),
            label: labelSchema,
            ids: z.array(z.string().min(1)),
        }),
        z.object({
            type: z.literal('replaceElements'),
            label: labelSchema,
            coalesceKey: z.string().max(120).nullable(),
            before: z.array(elementSchema),
            after: z.array(elementSchema),
        }),
        z.object({
            type: z.literal('replaceLayers'),
            label: labelSchema,
            before: z.array(layerSchema),
            after: z.array(layerSchema),
        }),
        z.object({
            type: z.literal('replaceSheets'),
            label: labelSchema,
            before: z.array(sheetSchema),
            after: z.array(sheetSchema),
        }),
        z.object({
            type: z.literal('replaceSettings'),
            label: labelSchema,
            before: settingsSchema,
            after: settingsSchema,
        }),
        z.object({
            type: z.literal('replaceDocument'),
            label: labelSchema,
            before: documentSchema,
            after: documentSchema,
        }),
        z.object({
            type: z.literal('combine'),
            label: labelSchema,
            commands: z.array(z.lazy(() => envelopeSchema)),
        }),
    ]),
);
