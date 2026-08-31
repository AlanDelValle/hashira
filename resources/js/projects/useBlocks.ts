import { useCallback, useEffect, useState } from 'react';

import {
    forgetAsset,
    registerAssets,
    type AssetCategory,
    type AssetDefinition,
} from '@/editor/assets/library';
import { api, type Envelope } from '@/lib/api';
import type { AssetPrimitive } from '@/editor/assets/library';
import type { BlockPayload } from '@/types/api';

/**
 * The blocks this account has made.
 *
 * They are registered with the editor's library as they arrive, so everything downstream —
 * the painter, the exporters, the thumbnails — resolves an id without knowing or caring
 * whether the block shipped with the editor or was drawn last week.
 */

export interface NewBlock {
    name: string;
    category: AssetCategory;
    width: number;
    height: number;
    draw: AssetPrimitive[];
}

interface BlocksState {
    blocks: BlockPayload[];
    loading: boolean;
    error: string | null;
    create: (block: NewBlock) => Promise<BlockPayload>;
    remove: (id: string) => Promise<void>;
}

/** A saved block as the editor's library sees it: the two are the same thing. */
export function blockDefinition(block: BlockPayload): AssetDefinition {
    return {
        id: block.id,
        name: block.name,
        category: block.category as AssetCategory,
        width: block.width,
        height: block.height,
        layerId: 'layer_furniture',
        draw: block.draw as AssetPrimitive[],
        own: true,
    };
}

/** Give the editor's library everything in a list of payloads. */
export function registerBlocks(blocks: readonly BlockPayload[]): void {
    registerAssets(blocks.map(blockDefinition));
}

export function useBlocks(): BlocksState {
    const [blocks, setBlocks] = useState<BlockPayload[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        void api
            .get<Envelope<BlockPayload[]>>('/api/blocks')
            .then((response) => {
                if (cancelled) return;

                registerBlocks(response.data);
                setBlocks(response.data);
            })
            .catch(() => {
                if (!cancelled) setError('Could not load your blocks.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const create = useCallback(async (block: NewBlock) => {
        const response = await api.post<Envelope<BlockPayload>>('/api/blocks', block);

        registerBlocks([response.data]);
        setBlocks((current) =>
            [...current, response.data].sort((one, other) => one.name.localeCompare(other.name)),
        );

        return response.data;
    }, []);

    const remove = useCallback(async (id: string) => {
        await api.delete(`/api/blocks/${id}`);

        // Left registered until the request comes back, so a drawing that has it on the sheet
        // never flickers into a dashed footprint and then out again if the delete fails.
        forgetAsset(id);
        setBlocks((current) => current.filter((block) => block.id !== id));
    }, []);

    return { blocks, loading, error, create, remove };
}
