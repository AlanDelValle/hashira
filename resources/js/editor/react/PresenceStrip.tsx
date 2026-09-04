import { usePresenceStore, type PresenceMember } from '@/editor/store/presenceStore';

/**
 * Who else is in here.
 *
 * Only other people: you know you are here, and a strip that said so would be one more thing
 * on a toolbar for no information. When nobody else is looking it shows nothing at all, which
 * is also why it never needs an empty state — the absence is the message.
 *
 * Each mark carries an initial and a name, not just a colour. Five hues are how you tell four
 * people apart at a glance; they are not how anybody is *identified*, and to somebody who
 * cannot separate two of them a colour-only strip would be a row of identical dots. The colour
 * is the same one their cursor is drawn in, from the same token, so the mark here and the
 * arrow on the sheet are visibly one person.
 */
export function PresenceStrip({ selfId }: { selfId: number | null }) {
    const members = usePresenceStore((state) => state.members);
    const others = members.filter((member) => member.id !== selfId);

    if (others.length === 0) {
        return null;
    }

    return (
        <div className="flex items-center gap-1" aria-label="Who else is here" role="group">
            {others.map((member) => (
                <Mark key={member.id} member={member} />
            ))}
        </div>
    );
}

function Mark({ member }: { member: PresenceMember }) {
    return (
        <span
            title={member.name}
            className="text-sheet flex size-5.5 items-center justify-center rounded-full text-[10px] font-medium"
            style={{ backgroundColor: `var(--color-presence-${(Math.abs(member.id) % 5) + 1})` }}
        >
            <span aria-hidden>{initial(member.name)}</span>
            <span className="sr-only">{member.name} is looking at this drawing</span>
        </span>
    );
}

/** The first letter of the name as written, which is the one a person recognises. */
function initial(name: string): string {
    return [...name.trim()][0]?.toUpperCase() ?? '?';
}
