import { SHORTCUT_GROUPS, type Shortcut } from '@/editor/input/shortcuts';
import { useEditorStore } from '@/editor/store/editorStore';
import { displayKey } from '@/lib/keys';
import { Modal } from '@/ui/Modal';

/**
 * The keyboard reference.
 *
 * Rendered from the same table the controller dispatches from, so it cannot describe a key
 * that does nothing. Reachable by pressing `?`, and by the button at the end of the status
 * bar for anyone who has not yet been told there is a `?` to press.
 */
export function ShortcutsDialog() {
    const open = useEditorStore((state) => state.shortcutsOpen);
    const setOpen = useEditorStore((state) => state.setShortcutsOpen);

    return (
        <Modal
            open={open}
            onOpenChange={setOpen}
            size="lg"
            title="Keyboard"
            description="Everything the editor listens for. The pointer entries are here because they belong to the same muscle memory."
        >
            {/* Columns rather than a grid: the groups are different lengths, and a grid leaves
                a hole under the short one instead of balancing the two sides. */}
            <div className="gap-10 sm:columns-2">
                {SHORTCUT_GROUPS.map((group) => (
                    <section key={group.title} className="mb-6 break-inside-avoid last:mb-0">
                        <h3 className="text-ink-subtle text-[11px] font-medium tracking-wide uppercase">
                            {group.title}
                        </h3>

                        <dl className="mt-2">
                            {group.shortcuts.map((shortcut) => (
                                <Row key={shortcut.label} shortcut={shortcut} />
                            ))}
                        </dl>
                    </section>
                ))}
            </div>
        </Modal>
    );
}

function Row({ shortcut }: { shortcut: Shortcut }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1">
            <dt className="text-ink-muted min-w-0 text-[13px]">{shortcut.label}</dt>

            <dd className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((chord, index) => (
                    <span key={index} className="flex items-center gap-1">
                        {index > 0 && <span className="text-ink-subtle text-[11px]">or</span>}
                        {chord.map((key) => (
                            <Key key={key} label={displayKey(key)} />
                        ))}
                    </span>
                ))}
            </dd>
        </div>
    );
}

function Key({ label }: { label: string }) {
    return (
        <kbd className="border-line-strong bg-sunken text-ink-muted inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-mono text-[11px] font-medium">
            {label}
        </kbd>
    );
}
