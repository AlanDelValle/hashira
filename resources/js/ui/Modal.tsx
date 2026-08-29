import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface ModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: ReactNode;
}

export function Modal({ open, onOpenChange, title, description, children }: ModalProps) {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="bg-overlay/25 fixed inset-0" />

                <Dialog.Content
                    className="border-line bg-surface shadow-panel fixed top-1/2 left-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6"
                    // Radix links the description itself when one is rendered. When there is
                    // none, passing the attribute explicitly marks the omission as intended.
                    {...(description === undefined ? { 'aria-describedby': undefined } : {})}
                >
                    <Dialog.Title className="text-ink text-base font-semibold tracking-tight">
                        {title}
                    </Dialog.Title>

                    {description !== undefined && (
                        <Dialog.Description className="text-ink-muted mt-1.5 text-sm">
                            {description}
                        </Dialog.Description>
                    )}

                    <div className="mt-5">{children}</div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
