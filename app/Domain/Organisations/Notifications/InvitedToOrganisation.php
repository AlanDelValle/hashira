<?php

declare(strict_types=1);

namespace App\Domain\Organisations\Notifications;

use App\Domain\Organisations\Models\OrganisationInvitation;
use App\Models\User;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The email that carries an invitation.
 *
 * Not queued, deliberately. There is no worker container — nothing in this application is
 * queued, which is why `QUEUE_CONNECTION=sync` is the honest production setting — so queueing
 * this would mean an invitation that is never sent on a self-hosted instance that followed the
 * documentation. Sending inside the request costs an admin a second on a rare action.
 *
 * It names who invited them and which firm. An invitation that says only "you have been
 * invited" is indistinguishable from a phishing attempt, and the person receiving it is being
 * asked to click a link and sign in.
 */
final class InvitedToOrganisation extends Notification
{
    public function __construct(
        private readonly OrganisationInvitation $invitation,
        private readonly User $inviter,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $organisation = $this->invitation->organisation->name;

        return (new MailMessage)
            ->subject("{$this->inviter->name} invited you to {$organisation} on Hashira")
            ->greeting('Hello')
            ->line("{$this->inviter->name} has invited you to join {$organisation} on Hashira, a tool for drawing floor plans.")
            ->line($this->invitation->role->administers()
                ? 'You will be able to administer it: its drawings, and who else is in it.'
                : 'You will be able to open and edit the drawings it owns.')
            ->action('Open the invitation', url("/invitations/{$this->invitation->token}"))
            ->line('The invitation expires in fourteen days.')
            ->line('If you were not expecting this, nothing happens until you accept it — and you can simply ignore this message.');
    }
}
