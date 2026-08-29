import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * A thin skin over Radix's dropdown. The primitive is here for the parts that are easy to
 * get subtly wrong — focus trapping, roving tab index, typeahead, dismissal — while every
 * pixel of the appearance is ours.
 */
export function Menu({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className={cn(
                        'border-line bg-surface min-w-44 rounded-md border p-1',
                        'shadow-popover',
                    )}
                >
                    {children}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

interface MenuItemProps {
    onSelect: () => void;
    children: ReactNode;
    destructive?: boolean;
}

export function MenuItem({ onSelect, children, destructive = false }: MenuItemProps) {
    return (
        <DropdownMenu.Item
            onSelect={onSelect}
            className={cn(
                'flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] outline-none',
                destructive
                    ? 'text-danger data-highlighted:bg-danger-soft'
                    : 'text-ink data-highlighted:bg-sunken',
            )}
        >
            {children}
        </DropdownMenu.Item>
    );
}

export function MenuSeparator() {
    return <DropdownMenu.Separator className="bg-line my-1 h-px" />;
}
