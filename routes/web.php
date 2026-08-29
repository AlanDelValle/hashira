<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::get('/up', fn () => response()->json(['status' => 'up']))->name('health');

/*
 * Everything the browser navigates to is the same SPA shell; React Router decides what to
 * render. The pattern excludes the paths Laravel owns so that an unmatched API call returns
 * a 404 instead of an HTML page.
 */
Route::get('/{path?}', fn () => view('app'))
    ->where('path', '^(?!api|storage|build|up).*$')
    ->name('spa');
