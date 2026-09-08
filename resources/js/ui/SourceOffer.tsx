import { runtimeConfig } from '@/lib/runtimeConfig';

/**
 * The licence, and where to get the source of *this* instance.
 *
 * The AGPL asks that people using a program over a network be offered its source, and an offer
 * pointing at the default branch is not one: the branch is not what they are talking to. So a
 * released image links its own commit, which the release workflow baked in, and says which
 * version that was. A checkout or a locally built image has neither, and links the repository
 * without claiming to know — offering the wrong source would be worse than offering none.
 *
 * It is in two footers and one component, which is the point of it being a component: the
 * landing page, because that is the one page every instance serves to everybody signed in or
 * not, and the projects list, because somebody working in a self-hosted instance may sign in
 * once and never see the landing page again — and an offer they cannot reach is not one.
 *
 * It is deliberately still not in the editor. Nothing about a licence belongs on a drawing
 * surface, and a person who is drawing has a way back to the list.
 */
export function SourceOffer() {
    const { repository, version, commit } = runtimeConfig().source;
    const ref = commit === '' ? 'main' : commit;

    return (
        <>
            <a href={`${repository}/blob/${ref}/LICENSE`} className="rounded-sm underline">
                AGPL-3.0
            </a>
            . Source{' '}
            <a href={`${repository}/tree/${ref}`} className="rounded-sm underline">
                {version === '' ? 'on GitHub' : `for ${version}`}
            </a>
            .
        </>
    );
}
