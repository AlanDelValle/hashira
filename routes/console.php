<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Nightly, and early enough that a slow dump is finished before anybody opens a drawing.
 *
 * `withoutOverlapping` because a database large enough to take more than a day to dump is a
 * database that would otherwise have two `pg_dump`s racing on it every night after that.
 */
Schedule::command('hashira:backup')
    ->dailyAt('03:15')
    ->withoutOverlapping()
    ->runInBackground();
