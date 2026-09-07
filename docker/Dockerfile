# syntax=docker/dockerfile:1

# The production image. One container serves the whole application — static files and PHP —
# and, if you point a domain at it, gets its own certificate.
#
# FrankenPHP rather than nginx and PHP-FPM, which is the arrangement this would have had two
# years ago. The reason is the phase's own goal: somebody self-hosting this should have as few
# moving parts as a drawing tool can be run with. Two processes talking over a socket, a second
# config file describing which paths are PHP, and certbot renewing a certificate on a timer are
# three things that can be misconfigured, and the first two exist only to serve `public/`.
#
# The worker, the scheduler and the socket server all run from this same image with a different
# command. One build, one thing to upgrade.

# ---------------------------------------------------------------------------------------------
# The browser's half. Built first because it changes least often and nothing else needs it.
# ---------------------------------------------------------------------------------------------
FROM node:22-alpine AS assets

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY resources ./resources
COPY vite.config.ts tsconfig.json ./
COPY public ./public

RUN npm run build

# ---------------------------------------------------------------------------------------------
# PHP's half. `--no-dev`, so nothing that only a test run needs is in the image somebody serves.
# ---------------------------------------------------------------------------------------------
FROM composer:2 AS vendor

WORKDIR /build

COPY composer.json composer.lock ./

# The dependencies first, with no autoloader, so that this layer is decided by the lock file
# alone — a change to `app/` does not send Composer back to the network.
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --no-interaction \
    --prefer-dist

# Then the source, and the classmap over it. This has to happen where Composer is: the runtime
# image is a PHP server and does not have it, which is the right shape — a running instance has
# no business being able to install dependencies.
COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY database ./database
COPY routes ./routes
COPY artisan ./

# `--optimize` and not `--classmap-authoritative`: the second one also switches off the PSR-4
# fallback, so any class the classmap missed stops existing rather than being found a slower
# way. The speed difference is small and the failure is not.
RUN composer dump-autoload --no-dev --optimize --no-scripts

# ---------------------------------------------------------------------------------------------
# What actually runs.
# ---------------------------------------------------------------------------------------------
FROM dunglas/frankenphp:1-php8.4-alpine AS runtime

# `pdo_pgsql` because the drawing is JSONB in PostgreSQL and that is not optional. `curl`
# because broadcasting an edit is an HTTP call from PHP — see AGENTS.md. `pcntl` so the socket
# server and the queue worker hear a signal and stop rather than being killed. `opcache` because
# an interpreter re-reading the same files on every request is the cheapest thing to fix.
# `postgresql-client` is for `hashira:backup`, which shells out to `pg_dump`.
RUN install-php-extensions pdo_pgsql pcntl opcache \
    && apk add --no-cache postgresql-client

WORKDIR /app

COPY --from=vendor /build/vendor ./vendor

COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY database ./database
COPY public ./public
COPY resources/views ./resources/views
COPY routes ./routes
COPY storage ./storage
COPY artisan composer.json composer.lock ./

# After `public/`, which `.dockerignore` keeps a host's stale build out of. The other way round,
# a rebuilt asset directory would be merged into rather than replaced.
COPY --from=assets /build/public/build ./public/build

COPY docker/Caddyfile /etc/frankenphp/Caddyfile
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
COPY docker/php.ini /usr/local/etc/php/conf.d/hashira.ini

# The autoloader was built without `app/`, `database/` and the rest present, so its classmap has
# nothing in it. This is the same command the vendor stage skipped, run where the files are.
# `.dockerignore` keeps a host's caches and logs out of the image, which also means these
# directories arrive empty or not at all — Laravel expects them to exist and does not create
# them. It is why an image can be built from a working tree in any state.
RUN mkdir -p storage/app/private storage/framework/cache/data storage/framework/sessions \
    storage/framework/views storage/logs bootstrap/cache \
    && chmod +x /usr/local/bin/entrypoint \
    && chown -R www-data:www-data storage bootstrap/cache

# What this instance is, for the source offer the AGPL asks for. Both are passed in by the
# release workflow; a locally built image simply says nothing rather than lying about a version.
ARG APP_VERSION=""
ARG APP_COMMIT=""
ENV APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT}

# `/up` is a route, so this answers only once PHP and the database are both reachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1/up || exit 1

EXPOSE 80 443

ENTRYPOINT ["entrypoint"]
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]
