import { AtSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { markAllMentionsRead, markMentionRead } from '@/mentions/mentions';
import { useMentionsStore } from '@/mentions/mentionsStore';
import { formatRelativeTime } from '@/lib/time';
import type { Mention } from '@/types/api';
import { Menu, MenuItem, MenuSeparator } from '@/ui/Menu';

/**
 * What you have been asked about.
 *
 * It says nothing at all when there is nothing — a permanently visible bell with a zero on it
 * is a thing to check rather than a thing to read, and this is a drafting tool. When there is
 * something, the count is a number and not only a dot, because a dot is a colour and a colour
 * on its own says nothing to a good part of the people looking at it.
 *
 * Choosing one takes you to the drawing it is on and marks it read on the way. The thread it
 * belongs to is carried in the address so the panel can open it: being told you were asked
 * something and then having to hunt for it is most of the way to not being told.
 */
export function MentionsMenu() {
    const mentions = useMentionsStore((state) => state.mentions);
    const forget = useMentionsStore((state) => state.forget);
    const navigate = useNavigate();

    if (mentions.length === 0) {
        return null;
    }

    async function open(mention: Mention) {
        forget(mention.id);

        try {
            await markMentionRead(mention.id);
        } catch {
            /* Going there matters more than recording that we did. */
        }

        await navigate(`/projects/${mention.projectId}?thread=${mention.threadId}`);
    }

    async function clear() {
        useMentionsStore.getState().clear();

        try {
            await markAllMentionsRead();
        } catch {
            void useMentionsStore.getState().load();
        }
    }

    return (
        <Menu
            trigger={
                <button
                    type="button"
                    aria-label={`${mentions.length} ${mentions.length === 1 ? 'mention' : 'mentions'} you have not read`}
                    className="text-ink-muted hover:bg-sunken hover:text-ink flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px]"
                >
                    <AtSign className="size-3.5" aria-hidden />
                    {mentions.length}
                </button>
            }
        >
            {mentions.map((mention) => (
                <MenuItem key={mention.id} onSelect={() => void open(mention)}>
                    <span className="block max-w-64">
                        <span className="text-ink block truncate text-[13px]">{mention.body}</span>
                        <span className="text-ink-subtle block truncate text-[11px]">
                            {mention.authorName ?? 'A former collaborator'} in {mention.projectName}{' '}
                            · {formatRelativeTime(mention.createdAt)}
                        </span>
                    </span>
                </MenuItem>
            ))}

            <MenuSeparator />

            <MenuItem onSelect={() => void clear()}>Mark all as read</MenuItem>
        </Menu>
    );
}
