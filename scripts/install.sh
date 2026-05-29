#!/usr/bin/env bash
set -euo pipefail

ARCH_SLUG=""
ARCH_DOMAIN=""
INSTALL_MODE="vps"
ARCH_ADMIN_FID=""
ARCH_SUPPORT_EMAIL=""
ASSUME_YES=0

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/install.sh \
    --arch anky \
    --domain anky.arches.lat \
    --mode vps \
    --admin-fid YOUR_FID \
    --email YOUR_SUPPORT_EMAIL \
    [--yes]

Options:
  --arch        Lowercase URL-safe community slug.
  --domain      Hostname for this Arch. Defaults to localhost in --mode local.
  --mode        Install mode: local, vps, or existing-proxy. Default: vps.
  --admin-fid   Numeric Farcaster FID for the first admin.
  --email       Support and ACME contact email.
  --yes         Start Docker Compose services after rendering files.
  --help        Show this help.
USAGE
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_value() {
  [ $# -gt 1 ] || die "$1 requires a value"
  [ -n "$2" ] || die "$1 requires a non-empty value"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --arch)
      need_value "$@"
      ARCH_SLUG="$2"
      shift 2
      ;;
    --arch=*)
      ARCH_SLUG="${1#*=}"
      shift
      ;;
    --domain)
      need_value "$@"
      ARCH_DOMAIN="$2"
      shift 2
      ;;
    --domain=*)
      ARCH_DOMAIN="${1#*=}"
      shift
      ;;
    --mode)
      need_value "$@"
      INSTALL_MODE="$2"
      shift 2
      ;;
    --mode=*)
      INSTALL_MODE="${1#*=}"
      shift
      ;;
    --admin-fid)
      need_value "$@"
      ARCH_ADMIN_FID="$2"
      shift 2
      ;;
    --admin-fid=*)
      ARCH_ADMIN_FID="${1#*=}"
      shift
      ;;
    --email)
      need_value "$@"
      ARCH_SUPPORT_EMAIL="$2"
      shift 2
      ;;
    --email=*)
      ARCH_SUPPORT_EMAIL="${1#*=}"
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

prompt_for() {
  local label="$1"
  local var_name="$2"
  local value=""

  [ -t 0 ] || die "$label is required and stdin is not interactive"
  printf '%s: ' "$label" >&2
  IFS= read -r value
  [ -n "$value" ] || die "$label cannot be empty"
  printf -v "$var_name" '%s' "$value"
}

[ -n "$ARCH_SLUG" ] || die "--arch is required"

case "$INSTALL_MODE" in
  local|vps|existing-proxy)
    ;;
  *)
    die "--mode must be local, vps, or existing-proxy"
    ;;
esac

if [ "$INSTALL_MODE" = "local" ] && [ -z "$ARCH_DOMAIN" ]; then
  ARCH_DOMAIN="localhost"
fi

if [ "$INSTALL_MODE" != "local" ] && [ -z "$ARCH_DOMAIN" ]; then
  die "--domain is required for --mode $INSTALL_MODE"
fi

if [ -z "$ARCH_ADMIN_FID" ] || [ "$ARCH_ADMIN_FID" = "YOUR_FID" ]; then
  prompt_for "Admin FID" ARCH_ADMIN_FID
fi

if [ -z "$ARCH_SUPPORT_EMAIL" ] || [ "$ARCH_SUPPORT_EMAIL" = "YOUR_SUPPORT_EMAIL" ]; then
  prompt_for "Support email" ARCH_SUPPORT_EMAIL
fi

printf '%s' "$ARCH_SLUG" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' \
  || die "--arch must be lowercase URL-safe text like anky or anky-labs"

if [ "$INSTALL_MODE" = "local" ] && [ "$ARCH_DOMAIN" = "localhost" ]; then
  :
else
  printf '%s' "$ARCH_DOMAIN" | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$' \
    || die "--domain must look like a hostname, for example anky.arches.lat"
fi

if [ "$INSTALL_MODE" != "local" ] && [ "$ARCH_DOMAIN" = "localhost" ]; then
  die "--mode $INSTALL_MODE requires a real domain, not localhost"
fi

printf '%s' "$ARCH_ADMIN_FID" | grep -Eq '^[0-9]+$' \
  || die "--admin-fid must be numeric"

printf '%s' "$ARCH_SUPPORT_EMAIL" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' \
  || die "--email must look like an email address"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$REPO_DIR/templates"

if [ "$(id -u)" = "0" ]; then
  DEFAULT_INSTALL_DIR="/opt/arches"
else
  DEFAULT_INSTALL_DIR="${HOME:?}/.arches"
fi

INSTALL_DIR="${ARCHES_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

random_secret() {
  local secret

  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 24)"
    printf '%s\n' "${secret:0:32}"
  elif [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
    secret="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    printf '%s\n' "${secret:0:32}"
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$(date +%s%N)-$$-$RANDOM" | sha256sum | awk '{print substr($1,1,32)}'
  else
    printf '%s' "$(date +%s)-$$-$RANDOM" | cksum | awk '{print $1}'
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\/&]/\\&/g'
}

render_template() {
  local source="$1"
  local target="$2"
  local domain email

  domain="$(escape_sed_replacement "$ARCH_DOMAIN")"
  email="$(escape_sed_replacement "$ARCH_SUPPORT_EMAIL")"

  sed \
    -e "s/__ARCH_DOMAIN__/$domain/g" \
    -e "s/__ARCH_SUPPORT_EMAIL__/$email/g" \
    "$source" > "$target"
}

render_compose_template() {
  local source="$1"
  local target="$2"
  local caddy_service=""
  local api_ports=""
  local web_ports=""

  if [ "$INSTALL_MODE" = "vps" ]; then
    caddy_service='  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - arches-api
      - arches-web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - arches'
  else
    api_ports='    ports:
      - "${ARCHES_HOST_BIND:-127.0.0.1}:${ARCHES_API_PORT:-3001}:3000"'
    web_ports='    ports:
      - "${ARCHES_HOST_BIND:-127.0.0.1}:${ARCHES_WEB_PORT:-3000}:3000"'
  fi

  while IFS= read -r line; do
    case "$line" in
      "__CADDY_SERVICE__")
        [ -n "$caddy_service" ] && printf '%s\n' "$caddy_service"
        ;;
      "__ARCHES_API_PORTS__")
        [ -n "$api_ports" ] && printf '%s\n' "$api_ports"
        ;;
      "__ARCHES_WEB_PORTS__")
        [ -n "$web_ports" ] && printf '%s\n' "$web_ports"
        ;;
      *)
        printf '%s\n' "$line"
        ;;
    esac
  done < "$source" > "$target"
}

[ -d "$TEMPLATE_DIR" ] || die "missing templates directory: $TEMPLATE_DIR"

mkdir -p "$INSTALL_DIR"

ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
CADDY_FILE="$INSTALL_DIR/Caddyfile"

if [ -e "$ENV_FILE" ]; then
  die "$ENV_FILE already exists; move it aside before generating a new appliance"
fi

POSTGRES_PASSWORD="$(random_secret)"
REDIS_PASSWORD="$(random_secret)"

cat > "$ENV_FILE" <<EOF
ARCH_SLUG=$ARCH_SLUG
ARCH_DOMAIN=$ARCH_DOMAIN
ARCHES_MODE=$INSTALL_MODE
ARCH_ADMIN_FID=$ARCH_ADMIN_FID
ARCH_SUPPORT_EMAIL=$ARCH_SUPPORT_EMAIL
ARCHES_API_IMAGE=ghcr.io/jpfraneto/arches-api:latest
ARCHES_WEB_IMAGE=ghcr.io/jpfraneto/arches-web:latest
HYPERSNAP_LITE_IMAGE=ghcr.io/jpfraneto/hypersnap-lite:latest
ARCHES_HOST_BIND=127.0.0.1
ARCHES_WEB_PORT=3000
ARCHES_API_PORT=3001
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD

# Experimental only. Disabled by default and not part of the core v0 install path.
ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED=false
ARCHES_COIN_SYMBOL=ARCHES
ARCHES_COIN_CONTRACT_ADDRESS=0x09b8903aBf2ea0721E34427353988c2F43c6d64F
ARCHES_COIN_DISCOUNT_BPS=1618
EOF

render_compose_template "$TEMPLATE_DIR/docker-compose.yml" "$COMPOSE_FILE"

if [ "$INSTALL_MODE" = "vps" ]; then
  render_template "$TEMPLATE_DIR/Caddyfile" "$CADDY_FILE"
else
  rm -f "$CADDY_FILE"
fi

printf '\nArches appliance files generated in %s\n\n' "$INSTALL_DIR"
printf 'Generated:\n'
printf '  %s\n' "$ENV_FILE"
printf '  %s\n' "$COMPOSE_FILE"
if [ "$INSTALL_MODE" = "vps" ]; then
  printf '  %s\n' "$CADDY_FILE"
fi
printf '\n'

compose_cmd=""
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    compose_cmd="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    compose_cmd="docker-compose"
  fi
fi

if [ -z "$compose_cmd" ]; then
  cat <<EOF
Docker Compose is not available yet.

Next steps:
  1. Install Docker Engine and the Docker Compose plugin on this machine.
  2. Review $ENV_FILE.
  3. Start the appliance when ready:
       cd "$INSTALL_DIR" && docker compose up -d

EOF
  exit 0
fi

case "$INSTALL_MODE" in
  local)
    MODE_NOTE="local exposes the web app at http://localhost:3000 and API at http://localhost:3001."
    ;;
  vps)
    MODE_NOTE="vps includes Caddy. Point DNS for $ARCH_DOMAIN at this server before starting."
    ;;
  existing-proxy)
    MODE_NOTE="existing-proxy exposes localhost ports for a user-managed reverse proxy routing $ARCH_DOMAIN."
    ;;
esac

cat <<EOF
Next steps:
  1. Review $ENV_FILE.
  2. Confirm the mode-specific routing below.
  3. Start the appliance when ready:
       cd "$INSTALL_DIR" && $compose_cmd up -d

Mode:
  $MODE_NOTE

EOF

if [ "$ASSUME_YES" = "1" ]; then
  printf 'Starting Docker Compose services with --yes...\n'
  (cd "$INSTALL_DIR" && $compose_cmd up -d)
else
  printf 'Safe default: services were not started. Re-run with --yes to start automatically.\n'
fi
