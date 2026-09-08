<?php

declare(strict_types=1);

namespace App\Domain\Projects\Models;

use App\Domain\Comments\Models\CommentThread;
use App\Domain\Documents\Models\Document;
use App\Domain\Organisations\Models\Organisation;
use App\Domain\Sharing\Models\ShareLink;
use App\Domain\Sharing\ShareRole;
use App\Domain\Underlays\Models\Underlay;
use App\Models\User;
use App\Policies\ProjectPolicy;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

/**
 * A project is what a user names, opens and shares. It owns the drawing rather than being
 * the drawing: the document is a separate row so that a project can grow to several sheets
 * without a migration.
 *
 * Since 10.2 it belongs to a user or to an organisation, never to both and never to neither.
 * The database says so with a check constraint rather than trusting this class to remember —
 * `user_id` and `organisation_id` are both nullable and exactly one is filled.
 *
 * @property string $id
 * @property int|null $user_id
 * @property string|null $organisation_id
 * @property string $name
 * @property string|null $description
 * @property Carbon|null $archived_at
 * @property Carbon|null $restricted_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[Fillable(['name', 'description'])]
#[UseFactory(ProjectFactory::class)]
#[UsePolicy(ProjectPolicy::class)]
class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use HasFactory;

    use HasUlids;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
            'restricted_at' => 'datetime',
        ];
    }

    /**
     * Deleting a project takes its underlays' pictures with it.
     *
     * The rows go by themselves — the foreign key cascades — but the files they point at are
     * on disk, and a database cascade has never deleted a file. Somebody else's survey left
     * lying in storage after the project that used it is gone is exactly the thing not to do.
     */
    protected static function booted(): void
    {
        static::deleting(function (self $project): void {
            Storage::deleteDirectory("underlays/{$project->id}");
        });
    }

    /**
     * The person who owns it, when a person does. Null for a project an organisation owns —
     * ask `organisation` in that case, and `ownerName` if all you want is something to print.
     *
     * @return BelongsTo<User, $this>
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return BelongsTo<Organisation, $this> */
    public function organisation(): BelongsTo
    {
        return $this->belongsTo(Organisation::class);
    }

    /** Something to print on a card about somebody else's drawing. */
    public function ownerName(): ?string
    {
        return $this->organisation_id === null
            ? $this->loadMissing('owner')->owner?->name
            : $this->loadMissing('organisation')->organisation?->name;
    }

    /** @return HasMany<Document, $this> */
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    /**
     * The MVP works with exactly one document per project. The relation is singular here and
     * plural above so that adding sheets later is additive rather than a rewrite.
     *
     * @return HasOne<Document, $this>
     */
    public function document(): HasOne
    {
        return $this->hasOne(Document::class)->oldestOfMany();
    }

    /**
     * Pages to trace over. They belong to the project rather than to the person: a survey is
     * imported to draw one particular building on top of.
     *
     * @return HasMany<Underlay, $this>
     */
    public function underlays(): HasMany
    {
        return $this->hasMany(Underlay::class);
    }

    /**
     * Everybody here who is not the owner. See ProjectMember: a row is written when somebody
     * signed in accepts a link that carries a role.
     *
     * @return HasMany<ProjectMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }

    /**
     * Everybody who can open this project: its owner, everybody a link let in, and — when an
     * organisation owns it — everybody in the organisation. It is the list somebody can
     * mention, and it is deliberately not the member list, which names accounts and belongs to
     * whoever administers the project.
     *
     * @return Collection<int, User>
     */
    public function people(): Collection
    {
        $members = $this->loadMissing('members.user')->members
            ->map(fn (ProjectMember $member): ?User => $member->user)
            ->filter()
            ->values();

        // Everybody in the organisation, when one owns it. They can all open the drawing, so
        // they are all people who can be asked about it — a mention list that named fewer
        // would be a list of people you are allowed to address, which is not the same thing.
        $fromOrganisation = $this->organisation_id === null
            ? new Collection
            : $this->loadMissing('organisation.members.user')->organisation?->people()
                ?? new Collection;

        /** @var Collection<int, User> */
        return $members
            ->concat($fromOrganisation)
            ->prepend($this->loadMissing('owner')->owner)
            ->filter()
            ->unique(fn (User $user): int => (int) $user->getKey())
            ->values();
    }

    /**
     * Whether this person is the one who owns it personally.
     *
     * Deliberately narrow, and deliberately not what the policy asks: a project an organisation
     * owns has no such person, and answering "no" to everybody would be true and useless. What
     * decides who may delete or share is `administeredBy`.
     */
    public function isOwnedBy(User $user): bool
    {
        return $this->user_id !== null && (int) $this->user_id === (int) $user->getKey();
    }

    /**
     * Whether this person may act on it as its owner — delete it, share it, decide who is in it.
     *
     * Two ways to be that: own it yourself, or administer the organisation that does. This is
     * the method the policy asks, and it is the only place the two kinds of owner meet.
     */
    public function administeredBy(User $user): bool
    {
        if ($this->isOwnedBy($user)) {
            return true;
        }

        return $this->loadMissing('organisation')
            ->organisation?->roleFor($user)?->administers() === true;
    }

    /**
     * What this person may do to the drawing, from whichever source says the most.
     *
     * A row on the project wins, in both directions: it is how somebody the organisation
     * admitted as an editor is raised or — 10.2c — narrowed. Falling back to the organisation
     * is what stops an office adding forty people to forty projects by hand.
     *
     * The owner and an organisation's admins are not answered here at all. They administer,
     * which is a different question, and keeping the two apart is what stops an owner's access
     * depending on a row existing.
     */
    public function effectiveRole(User $user): ?ShareRole
    {
        $granted = $this->memberRole($user);

        if ($granted !== null) {
            return $granted;
        }

        // Restricted means the organisation grants nothing here. The row above is then the only
        // way in, which is what makes restriction a real narrowing rather than a label.
        if ($this->isRestricted()) {
            return null;
        }

        return $this->loadMissing('organisation')->organisation?->roleFor($user)?->onProject();
    }

    /**
     * Whether being in the owning organisation is enough to open this.
     *
     * It never hides a drawing from somebody who administers the firm: `administeredBy` is
     * asked before this, and a project its own admins could not reach would be a project nobody
     * could un-restrict or recover.
     */
    public function isRestricted(): bool
    {
        return $this->restricted_at !== null;
    }

    /**
     * What this person holds here, or null if they hold nothing. The owner is not a member of
     * their own project and gets null too — ownership is answered by `isOwnedBy`, and keeping
     * the two apart is what stops an owner's access depending on a row existing.
     *
     * Reads a loaded `members` relation when there is one, so listing projects does not turn
     * into a query per card.
     */
    public function memberRole(User $user): ?ShareRole
    {
        return $this->membershipFor($user)?->role;
    }

    /**
     * The row itself, which the interface needs in order to offer somebody the way out: a
     * member leaves by deleting their own membership.
     */
    public function membershipFor(User $user): ?ProjectMember
    {
        return $this->relationLoaded('members')
            ? $this->members->firstWhere('user_id', (int) $user->getKey())
            : $this->members()->where('user_id', $user->getKey())->first();
    }

    /**
     * The conversations on this drawing. They belong to the project rather than to the
     * document, because a remark outlives the revision it was made against — see
     * document-format.md on why nothing about a comment is in `documents.data`.
     *
     * @return HasMany<CommentThread, $this>
     */
    public function commentThreads(): HasMany
    {
        return $this->hasMany(CommentThread::class);
    }

    /** @return HasMany<ShareLink, $this> */
    public function shareLinks(): HasMany
    {
        return $this->hasMany(ShareLink::class);
    }

    /** @return HasOne<ShareLink, $this> */
    public function activeShareLink(): HasOne
    {
        return $this->hasOne(ShareLink::class)->active()->latestOfMany();
    }
}
