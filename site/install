#!/usr/bin/env bash
set -euo pipefail

ARCH_SLUG=""
ARCH_DOMAIN=""
INSTALL_MODE="vps"
ARCH_ADMIN_FID=""
ARCH_SUPPORT_EMAIL=""
CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
ARCHES_SETUP_BROKER_URL="${ARCHES_SETUP_BROKER_URL:-}"
ASSUME_YES=0
ORIGINAL_ARG_COUNT=$#

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/install.sh

  bash scripts/install.sh \
    --arch anky \
    --domain anky.arches.lat \
    --mode vps \
    --admin-fid YOUR_FID \
    --email YOUR_SUPPORT_EMAIL \
    [--tunnel-token CLOUDFLARE_TUNNEL_TOKEN] \
    [--yes]

Options:
  With no options, start a zero-info setup session through the Arches setup
  broker. Set ARCHES_SETUP_BROKER_URL to use a local broker while testing.

  --arch        Lowercase URL-safe community slug.
  --domain      Hostname for this Arch. Defaults to localhost in --mode local.
  --mode        Install mode: local, tunnel-local, vps, or existing-proxy.
                Default: vps.
  --admin-fid   Numeric Farcaster FID for the first admin.
  --email       Support and ACME contact email.
  --tunnel-token  Cloudflare Tunnel token for --mode tunnel-local.
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

start_zero_info_setup() {
  local install_dir env_file compose_file compose_cmd=""

  if [ "$(id -u)" = "0" ]; then
    install_dir="${ARCHES_INSTALL_DIR:-/opt/arches}"
  else
    install_dir="${ARCHES_INSTALL_DIR:-${HOME:?}/.arches}"
  fi

  mkdir -p "$install_dir"
  env_file="$install_dir/.env"
  compose_file="$install_dir/docker-compose.yml"

  if [ -e "$env_file" ]; then
    die "$env_file already exists; move it aside before generating a new setup appliance"
  fi

  touch "$env_file"
  chmod 600 "$env_file"

  cat > "$env_file" <<EOF
ARCHES_MODE=setup
ARCHES_SETUP_BROKER_IMAGE=ghcr.io/jpfraneto/arches-setup-broker:latest
ARCHES_SETUP_PORT=3020
ARCHES_SETUP_PUBLIC_ORIGIN=http://localhost:3020

# Provider boundaries. Defaults fail closed until configured.
ARCHES_FARCASTER_VERIFIER=
ARCHES_SIGNER_PROVIDER=
ARCHES_CHANNEL_PROVIDER=
ARCHES_TUNNEL_PROVIDER=
ARCHES_APPLIANCE_LAUNCH_PROVIDER=
ARCHES_PUBLISHING_VERIFICATION_PROVIDER=
EOF

  cat > "$compose_file" <<'EOF_COMPOSE'
services:
  arches-setup-broker:
    image: ${ARCHES_SETUP_BROKER_IMAGE:-ghcr.io/jpfraneto/arches-setup-broker:latest}
    restart: unless-stopped
    environment:
      PORT: "3020"
      ARCHES_SETUP_PUBLIC_ORIGIN: ${ARCHES_SETUP_PUBLIC_ORIGIN:-http://localhost:3020}
      ARCHES_SETUP_STORE_FILE: /var/lib/arches/setup-store.json
      ARCHES_FARCASTER_VERIFIER: ${ARCHES_FARCASTER_VERIFIER}
      ARCHES_SIGNER_PROVIDER: ${ARCHES_SIGNER_PROVIDER}
      ARCHES_CHANNEL_PROVIDER: ${ARCHES_CHANNEL_PROVIDER}
      ARCHES_TUNNEL_PROVIDER: ${ARCHES_TUNNEL_PROVIDER}
      ARCHES_APPLIANCE_LAUNCH_PROVIDER: ${ARCHES_APPLIANCE_LAUNCH_PROVIDER}
      ARCHES_PUBLISHING_VERIFICATION_PROVIDER: ${ARCHES_PUBLISHING_VERIFICATION_PROVIDER}
    ports:
      - "127.0.0.1:${ARCHES_SETUP_PORT:-3020}:3020"
    volumes:
      - setup_data:/var/lib/arches

volumes:
  setup_data:
EOF_COMPOSE

  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      compose_cmd="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
      compose_cmd="docker-compose"
    fi
  fi

  cat <<EOF
Arches setup appliance files generated in $install_dir

Generated:
  $env_file
  $compose_file

Next steps:
  1. Review $env_file.
  2. Start setup when ready:
       cd "$install_dir" && ${compose_cmd:-docker compose} up -d
  3. Open setup:
       http://localhost:3020/setup

Setup flow:
  Run one command, scan with Farcaster, approve a publishing signer, choose a
  channel you own or moderate, then let Arches render the Arch appliance config.

Safe default: services were not started. Re-run with --yes to start automatically.
EOF

  if [ "$ASSUME_YES" = "1" ]; then
    [ -n "$compose_cmd" ] || die "Docker Compose is required for --yes"
    (cd "$install_dir" && $compose_cmd up -d)
  fi
}

if [ "$ORIGINAL_ARG_COUNT" = "0" ]; then
  start_zero_info_setup
  exit 0
fi

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
    --tunnel-token)
      need_value "$@"
      CLOUDFLARE_TUNNEL_TOKEN="$2"
      shift 2
      ;;
    --tunnel-token=*)
      CLOUDFLARE_TUNNEL_TOKEN="${1#*=}"
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
  local|tunnel-local|vps|existing-proxy)
    ;;
  *)
    die "--mode must be local, tunnel-local, vps, or existing-proxy"
    ;;
esac

if [ "$INSTALL_MODE" = "local" ] && [ -z "$ARCH_DOMAIN" ]; then
  ARCH_DOMAIN="localhost"
fi

if [ "$INSTALL_MODE" != "local" ] && [ -z "$ARCH_DOMAIN" ]; then
  die "--domain is required for --mode $INSTALL_MODE"
fi

if [ "$INSTALL_MODE" = "tunnel-local" ] && [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  die "--mode tunnel-local requires --tunnel-token from the Arches control plane or Cloudflare"
fi

if [ -z "$ARCH_ADMIN_FID" ] || [ "$ARCH_ADMIN_FID" = "YOUR_FID" ]; then
  prompt_for "Admin FID" ARCH_ADMIN_FID
fi

if [ "$INSTALL_MODE" = "tunnel-local" ] && { [ -z "$ARCH_SUPPORT_EMAIL" ] || [ "$ARCH_SUPPORT_EMAIL" = "YOUR_SUPPORT_EMAIL" ]; }; then
  ARCH_SUPPORT_EMAIL="support@arches.lat"
elif [ -z "$ARCH_SUPPORT_EMAIL" ] || [ "$ARCH_SUPPORT_EMAIL" = "YOUR_SUPPORT_EMAIL" ]; then
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

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [ -n "$SCRIPT_PATH" ]; then
  SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
  REPO_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
else
  SCRIPT_DIR="$(pwd)"
  REPO_DIR="$SCRIPT_DIR"
fi
TEMPLATE_DIR="$REPO_DIR/templates"

EMBEDDED_TEMPLATE_DIR=""

write_embedded_templates() {
  local target_dir="$1"

  mkdir -p "$target_dir"

  cat > "$target_dir/docker-compose.yml" <<'EOF_COMPOSE'
services:
__CADDY_SERVICE__
__CLOUDFLARED_SERVICE__

  arches-api:
    image: ${ARCHES_API_IMAGE:-ghcr.io/jpfraneto/arches-api:latest}
    restart: unless-stopped
    environment:
      PORT: "3000"
      ARCH_SLUG: ${ARCH_SLUG}
      ARCH_DOMAIN: ${ARCH_DOMAIN}
      ARCH_ADMIN_FID: ${ARCH_ADMIN_FID}
      ARCH_SUPPORT_EMAIL: ${ARCH_SUPPORT_EMAIL}
      ARCH_SURFACE_PRESET: ${ARCH_SURFACE_PRESET}
      ARCH_GRAMMAR_PRESET: ${ARCH_GRAMMAR_PRESET}
      ARCH_THEME_PRESET: ${ARCH_THEME_PRESET}
      ARCH_SURFACE_TITLE: ${ARCH_SURFACE_TITLE}
      ARCH_PROVENANCE_LABEL: ${ARCH_PROVENANCE_LABEL}
      ARCH_CHANNEL_ID: ${ARCH_CHANNEL_ID}
      ARCH_CHANNEL_URL: ${ARCH_CHANNEL_URL}
      ARCH_SIGNER_PUBLIC_KEY: ${ARCH_SIGNER_PUBLIC_KEY}
      ARCH_SIGNER_PRIVATE_KEY: ${ARCH_SIGNER_PRIVATE_KEY}
      FARCASTER_NETWORK: ${FARCASTER_NETWORK:-mainnet}
      HYPERSNAP_LITE_URL: http://hypersnap-lite:3381
      HYPERSNAP_LITE_HEALTH_PATH: ${HYPERSNAP_LITE_HEALTH_PATH}
      ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED: ${ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED}
      ARCHES_COIN_SYMBOL: ${ARCHES_COIN_SYMBOL}
      ARCHES_COIN_CONTRACT_ADDRESS: ${ARCHES_COIN_CONTRACT_ADDRESS}
      ARCHES_COIN_DISCOUNT_BPS: ${ARCHES_COIN_DISCOUNT_BPS}
    depends_on:
      hypersnap-lite:
        condition: service_healthy
    expose:
      - "3000"
__ARCHES_API_PORTS__
    networks:
      - arches

  arches-web:
    image: ${ARCHES_WEB_IMAGE:-ghcr.io/jpfraneto/arches-web:latest}
    restart: unless-stopped
    environment:
      PORT: "3000"
      API_ORIGIN: http://arches-api:3000
    depends_on:
      - arches-api
    expose:
      - "3000"
__ARCHES_WEB_PORTS__
    networks:
      - arches

  hypersnap-lite:
    image: ${HYPERSNAP_LITE_IMAGE:-ghcr.io/jpfraneto/hypersnap-lite:latest}
    platform: ${HYPERSNAP_LITE_PLATFORM:-linux/amd64}
    restart: unless-stopped
    environment:
      ARCH_SLUG: ${ARCH_SLUG}
      ARCH_DOMAIN: ${ARCH_DOMAIN}
    expose:
      - "3381"
      - "3382/udp"
      - "3383"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3381/v1/info"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 30s
    networks:
      - arches

volumes:
  caddy_data:
  caddy_config:

networks:
  arches:
    name: arches-${ARCH_SLUG}-${ARCHES_MODE}
EOF_COMPOSE

  cat > "$target_dir/Caddyfile" <<'EOF_CADDY'
{
	email __ARCH_SUPPORT_EMAIL__
}

__ARCH_DOMAIN__ {
	encode zstd gzip

	handle /health {
		reverse_proxy arches-api:3000
	}

	handle /api/* {
		reverse_proxy arches-api:3000
	}

	handle {
		reverse_proxy arches-web:3000
	}
}
EOF_CADDY
}

if [ "$(id -u)" = "0" ]; then
  DEFAULT_INSTALL_DIR="/opt/arches"
else
  DEFAULT_INSTALL_DIR="${HOME:?}/.arches"
fi

INSTALL_DIR="${ARCHES_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

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
  local cloudflared_service=""
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
  elif [ "$INSTALL_MODE" = "tunnel-local" ]; then
    cloudflared_service='  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - arches-api
      - arches-web
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
      "__CLOUDFLARED_SERVICE__")
        [ -n "$cloudflared_service" ] && printf '%s\n' "$cloudflared_service"
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

if [ ! -d "$TEMPLATE_DIR" ]; then
  EMBEDDED_TEMPLATE_DIR="$(mktemp -d)"
  trap 'rm -rf "$EMBEDDED_TEMPLATE_DIR"' EXIT
  write_embedded_templates "$EMBEDDED_TEMPLATE_DIR"
  TEMPLATE_DIR="$EMBEDDED_TEMPLATE_DIR"
fi

mkdir -p "$INSTALL_DIR"

ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
CADDY_FILE="$INSTALL_DIR/Caddyfile"

if [ -e "$ENV_FILE" ]; then
  die "$ENV_FILE already exists; move it aside before generating a new appliance"
fi

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

ARCH_SURFACE_PRESET="village"
ARCH_GRAMMAR_PRESET="open-casts"
ARCH_THEME_PRESET="daylight"
ARCH_SURFACE_TITLE="/$ARCH_SLUG"
ARCH_PROVENANCE_LABEL="posted via $ARCH_SLUG"
ARCH_CHANNEL_ID="$ARCH_SLUG"
ARCH_CHANNEL_URL="https://warpcast.com/~/channel/$ARCH_SLUG"

cat > "$ENV_FILE" <<EOF
ARCH_SLUG=$ARCH_SLUG
ARCH_DOMAIN=$ARCH_DOMAIN
ARCHES_MODE=$INSTALL_MODE
ARCH_ADMIN_FID=$ARCH_ADMIN_FID
ARCH_SUPPORT_EMAIL=$ARCH_SUPPORT_EMAIL
ARCH_SURFACE_PRESET=$ARCH_SURFACE_PRESET
ARCH_GRAMMAR_PRESET=$ARCH_GRAMMAR_PRESET
ARCH_THEME_PRESET=$ARCH_THEME_PRESET
ARCH_SURFACE_TITLE=$ARCH_SURFACE_TITLE
ARCH_PROVENANCE_LABEL=$ARCH_PROVENANCE_LABEL
ARCH_CHANNEL_ID=$ARCH_CHANNEL_ID
ARCH_CHANNEL_URL=$ARCH_CHANNEL_URL
ARCH_SIGNER_PUBLIC_KEY=
FARCASTER_NETWORK=mainnet

# Runtime images
ARCHES_API_IMAGE=ghcr.io/jpfraneto/arches-api:latest
ARCHES_WEB_IMAGE=ghcr.io/jpfraneto/arches-web:latest
HYPERSNAP_LITE_IMAGE=ghcr.io/jpfraneto/hypersnap-lite:latest
HYPERSNAP_LITE_PLATFORM=linux/amd64
HYPERSNAP_LITE_URL=http://hypersnap-lite:3381
HYPERSNAP_LITE_HEALTH_PATH=/v1/info

# Local port bindings
ARCHES_HOST_BIND=127.0.0.1
ARCHES_WEB_PORT=3000
ARCHES_API_PORT=3001

# Secret runtime credentials
ARCH_SIGNER_PRIVATE_KEY=
CLOUDFLARE_TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN

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
  tunnel-local)
    MODE_NOTE="tunnel-local runs cloudflared in Docker. Cloudflare routes $ARCH_DOMAIN to this appliance over an outbound tunnel."
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
