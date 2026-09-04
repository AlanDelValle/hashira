import { Fragment } from 'react';

import type { CommentMention } from '@/types/api';

/**
 * A remark, with the people it was aimed at picked out.
 *
 * The client does no parsing. It is handed the exact text of each mention by the server —
 * which resolved them once, when the remark was written — and marks those strings. Working out
 * for itself what looks like a mention would be a second copy of a rule that already exists,
 * and the two would disagree the first time somebody was removed from a project.
 *
 * A mention is marked by weight as well as by colour, because a name that stands out only in
 * accent does not stand out at all for a good part of the people reading it.
 */
export function CommentBody({ body, mentions }: { body: string; mentions: CommentMention[] }) {
    const texts = [...new Set(mentions.map((mention) => mention.text))].sort(
        (a, b) => b.length - a.length,
    );

    if (texts.length === 0) {
        return <>{body}</>;
    }

    return (
        <>
            {split(body, texts).map((part, index) => (
                <Fragment key={index}>
                    {part.mention ? (
                        <span className="text-accent-strong font-medium">{part.text}</span>
                    ) : (
                        part.text
                    )}
                </Fragment>
            ))}
        </>
    );
}

/** Longest first, so a short name inside a long one does not claim the match. */
function split(body: string, texts: string[]): { text: string; mention: boolean }[] {
    const parts: { text: string; mention: boolean }[] = [];
    let rest = body;

    while (rest.length > 0) {
        const hit = texts
            .map((text) => ({ text, at: rest.indexOf(text) }))
            .filter((one) => one.at >= 0)
            .sort((a, b) => a.at - b.at || b.text.length - a.text.length)[0];

        if (hit === undefined) {
            parts.push({ text: rest, mention: false });
            break;
        }

        if (hit.at > 0) {
            parts.push({ text: rest.slice(0, hit.at), mention: false });
        }

        parts.push({ text: hit.text, mention: true });
        rest = rest.slice(hit.at + hit.text.length);
    }

    return parts;
}
