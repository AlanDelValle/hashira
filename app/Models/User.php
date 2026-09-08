<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Domain\Organisations\Models\OrganisationMember;
use App\Domain\Projects\Models\Project;
use App\Domain\Projects\Models\ProjectMember;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /** @return HasMany<Project, $this> */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    /**
     * The firms this person is in. Their projects are reached through the organisation rather
     * than from here, because being in an organisation is a standing, not a list of drawings.
     *
     * @return HasMany<OrganisationMember, $this>
     */
    public function organisationMemberships(): HasMany
    {
        return $this->hasMany(OrganisationMember::class);
    }

    /**
     * Projects somebody else owns that this person was let into. Separate from `projects`
     * rather than folded into it, because owning and being admitted are different standings
     * and the interface says which one a card is.
     *
     * @return HasMany<ProjectMember, $this>
     */
    public function projectMemberships(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }
}
