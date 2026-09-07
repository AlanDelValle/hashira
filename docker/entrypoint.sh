#!/bin/sh
set -e

# Every container in the compose file runs this, then its own command: the server, the
# scheduler, the socket. What is shared is the preparation — a key, a reachable database, and
# the caches that make a request cheap.

if [ -z "${APP_KEY}" ]; then
	echo "APP_KEY is empty."
	echo
	echo "Generate one and put it in your .env, then start again:"
	echo
	echo "  docker compose run --rm --no-deps app php artisan key:generate --show"
	echo
	echo "Without it Laravel cannot decrypt a session or a cookie, and every sign-in would fail"
	echo "with an error that does not mention this."
	exit 1
fi

# The database container reports healthy before it is ready to answer, and an application that
# crash-loops on start is one somebody has to watch to know is fine. Sixty seconds is longer
# than a first boot with an empty data directory takes.
#
# `pg_isready` rather than `php artisan db:show`, which was the first attempt and is a trap:
# `db:show` formats the table count through `Number::format`, which needs the `intl` extension
# this image does not carry, so it fails — but only once there are tables to count. It works on
# the very first boot and then fails on every one after it, which is the worst shape a bug can
# have. `pg_isready` is the purpose-built answer and is already here for `pg_dump`.
if [ "${WAIT_FOR_DATABASE:-true}" = "true" ]; then
	i=0
	until pg_isready -h "${DB_HOST}" -p "${DB_PORT:-5432}" -U "${DB_USERNAME}" >/dev/null 2>&1; do
		i=$((i + 1))
		if [ "${i}" -ge 60 ]; then
			echo "The database did not answer after 60 seconds. Giving up so the failure is visible."
			exit 1
		fi
		sleep 1
	done
fi

# One container runs these, set in the compose file. Migrating from three places at once is how
# two of them end up applying the same migration.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
	php artisan migrate --force --no-interaction
fi

# Cached from the environment at boot rather than baked into the image, which is the whole point
# of `config/hashira.php`: one image, and each instance reads its own answers on the way up.
php artisan config:cache
php artisan route:cache
php artisan view:cache

exec "$@"
