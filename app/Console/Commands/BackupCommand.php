<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

/**
 * A copy of everything somebody would be sorry to lose.
 *
 * Two things hold work and they are not in the same place. The drawings are rows — one JSONB
 * column each — and go out as a `pg_dump`. The underlays somebody traces over and the blocks
 * they made are files on the private disk, and go out as a tar. A backup of either alone
 * restores an instance that is missing half of what people put into it.
 *
 * It shells out rather than reading tables in PHP, because `pg_dump` already knows about
 * ownership, sequences, extensions and the order of a restore, and a loop over Eloquent models
 * that thinks it knows those things is how a backup turns out not to restore.
 *
 * Nothing here sends anything anywhere. A dump sitting on the same disk as the database is not
 * a backup of the disk failing — copying it off the machine is the operator's job and
 * `docs/self-hosting.md` says so in as many words.
 */
final class BackupCommand extends Command
{
    protected $signature = 'hashira:backup
        {--path= : Where to write, overriding hashira.backup.path}
        {--keep= : How many days to keep, overriding hashira.backup.keep_days}';

    protected $description = 'Write a dump of the database and an archive of the files that hold work';

    public function handle(): int
    {
        $path = (string) ($this->option('path') ?? config('hashira.backup.path'));
        $keep = (int) ($this->option('keep') ?? config('hashira.backup.keep_days'));

        File::ensureDirectoryExists($path);

        $stamp = now()->format('Y-m-d-His');

        if (! $this->dumpDatabase($path.'/hashira-'.$stamp.'.dump')) {
            return self::FAILURE;
        }

        if (! $this->archiveFiles($path.'/hashira-files-'.$stamp.'.tar.gz')) {
            return self::FAILURE;
        }

        $this->prune($path, $keep);

        return self::SUCCESS;
    }

    private function dumpDatabase(string $target): bool
    {
        /** @var array<string, mixed> $connection */
        $connection = config('database.connections.'.config('database.default'));

        $process = new Process(
            [
                'pg_dump',
                '--host='.(string) $connection['host'],
                '--port='.(string) $connection['port'],
                '--username='.(string) $connection['username'],
                '--dbname='.(string) $connection['database'],
                // Custom format: compressed, and `pg_restore` can be told to skip or reorder
                // parts of it. A plain SQL file is only ever restorable in one way.
                '--format=custom',
                '--file='.$target,
            ],
            env: ['PGPASSWORD' => (string) $connection['password']],
            timeout: 3600,
        );

        $process->run();

        if (! $process->isSuccessful()) {
            $this->components->error('pg_dump failed: '.trim($process->getErrorOutput()));

            return false;
        }

        $this->components->info('Database: '.$this->describe($target));

        return true;
    }

    private function archiveFiles(string $target): bool
    {
        $root = storage_path('app/private');

        if (! File::isDirectory($root)) {
            $this->components->warn('No private disk to archive; skipping the files.');

            return true;
        }

        // `-C` so the archive holds relative paths and restores wherever it is unpacked, rather
        // than carrying `/app/storage` inside it and only fitting one layout.
        $process = new Process(['tar', '-czf', $target, '-C', $root, '.'], timeout: 3600);

        $process->run();

        if (! $process->isSuccessful()) {
            $this->components->error('tar failed: '.trim($process->getErrorOutput()));

            return false;
        }

        $this->components->info('Files: '.$this->describe($target));

        return true;
    }

    /**
     * Old copies go, but only ones this command wrote.
     *
     * The glob is deliberately narrow: somebody will point `BACKUP_PATH` at a directory that
     * already has something else in it, and a backup command that deletes by age alone is a
     * backup command that eventually deletes the thing it was told to sit next to.
     */
    private function prune(string $path, int $keep): void
    {
        if ($keep <= 0) {
            return;
        }

        $cutoff = now()->subDays($keep)->getTimestamp();
        $removed = 0;

        // Two globs rather than one with `GLOB_BRACE`, which musl does not implement and which
        // therefore does not exist in the Alpine image this actually runs in. It cost a failed
        // prune on the first run inside a container to find that out.
        $ours = array_merge(
            glob($path.'/hashira-*.dump') ?: [],
            glob($path.'/hashira-*.tar.gz') ?: [],
        );

        foreach ($ours as $file) {
            if (filemtime($file) < $cutoff) {
                File::delete($file);
                $removed++;
            }
        }

        if ($removed > 0) {
            $this->components->info('Removed '.$removed.' copies older than '.$keep.' days.');
        }
    }

    /**
     * The line an operator reads to know the backup happened, so it has to be readable.
     *
     * In megabytes alone a fresh instance's dump reports "0.0 MB", which looks exactly like
     * nothing having been written.
     */
    private function describe(string $file): string
    {
        $bytes = File::size($file);

        $size = $bytes < 1_048_576
            ? number_format($bytes / 1024, 1).' KB'
            : number_format($bytes / 1_048_576, 1).' MB';

        return basename($file).' ('.$size.')';
    }
}
