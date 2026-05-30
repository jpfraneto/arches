#!/usr/bin/env bash
set -euo pipefail

ARCH_SLUG=""
ARCH_DOMAIN=""
ARCH_ADMIN_FID=""
ARCH_SUPPORT_EMAIL="support@arches.lat"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/provision-cloudflare-tunnel.sh \
    --arch anky \
    --domain anky.arches.lat \
    --admin-fid 123 \
    --email support@example.com

Environment:
  CLOUDFLARE_ACCOUNT_ID  Cloudflare account ID.
  CLOUDFLARE_ZONE_ID     Cloudflare zone ID for arches.lat.
  CLOUDFLARE_API_TOKEN   API token with tunnel and DNS write permissions.

Output:
  Prints an install command containing the Cloudflare Tunnel token.

This script is an operator/control-plane primitive. It does not verify Farcaster
identity. Only call it after a real Sign in with Farcaster flow has established
the admin FID and reserved the Arch slug.
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
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[ -n "$ARCH_SLUG" ] || die "--arch is required"
[ -n "$ARCH_DOMAIN" ] || die "--domain is required"
[ -n "$ARCH_ADMIN_FID" ] || die "--admin-fid is required"
[ -n "$CLOUDFLARE_ACCOUNT_ID" ] || die "CLOUDFLARE_ACCOUNT_ID is required"
[ -n "$CLOUDFLARE_ZONE_ID" ] || die "CLOUDFLARE_ZONE_ID is required"
[ -n "$CLOUDFLARE_API_TOKEN" ] || die "CLOUDFLARE_API_TOKEN is required"

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v jq >/dev/null 2>&1 || die "jq is required"

printf '%s' "$ARCH_SLUG" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' \
  || die "--arch must be lowercase URL-safe text like anky or anky-labs"

printf '%s' "$ARCH_DOMAIN" | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$' \
  || die "--domain must look like a hostname, for example anky.arches.lat"

printf '%s' "$ARCH_ADMIN_FID" | grep -Eq '^[0-9]+$' \
  || die "--admin-fid must be numeric"

printf '%s' "$ARCH_SUPPORT_EMAIL" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' \
  || die "--email must look like an email address"

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local response
  local success

  if [ -n "$data" ]; then
    response="$(curl -fsSL \
      -X "$method" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$data" \
      "https://api.cloudflare.com/client/v4$path")"
  else
    response="$(curl -fsSL \
      -X "$method" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "https://api.cloudflare.com/client/v4$path")"
  fi

  success="$(printf '%s' "$response" | jq -r '.success')"
  [ "$success" = "true" ] || die "Cloudflare API call failed: $response"
  printf '%s\n' "$response"
}

tunnel_name="arches-${ARCH_SLUG}"
tunnel_body="$(jq -n --arg name "$tunnel_name" '{name: $name, config_src: "cloudflare"}')"
tunnel_response="$(cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel" "$tunnel_body")"
tunnel_id="$(printf '%s' "$tunnel_response" | jq -r '.result.id')"

config_body="$(jq -n --arg hostname "$ARCH_DOMAIN" '{
  config: {
    ingress: [
      {hostname: $hostname, path: "/api/*", service: "http://arches-api:3000"},
      {hostname: $hostname, path: "/health", service: "http://arches-api:3000"},
      {hostname: $hostname, service: "http://arches-web:3000"},
      {service: "http_status:404"}
    ]
  }
}')"
cf_api PUT "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$tunnel_id/configurations" "$config_body" >/dev/null

dns_name="$ARCH_DOMAIN"
dns_target="${tunnel_id}.cfargotunnel.com"
dns_lookup="$(cf_api GET "/zones/$CLOUDFLARE_ZONE_ID/dns_records?type=CNAME&name=$dns_name")"
dns_record_id="$(printf '%s' "$dns_lookup" | jq -r '.result[0].id // empty')"
dns_body="$(jq -n \
  --arg type "CNAME" \
  --arg name "$dns_name" \
  --arg content "$dns_target" \
  '{type: $type, name: $name, content: $content, proxied: true}')"

if [ -n "$dns_record_id" ]; then
  cf_api PATCH "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$dns_record_id" "$dns_body" >/dev/null
else
  cf_api POST "/zones/$CLOUDFLARE_ZONE_ID/dns_records" "$dns_body" >/dev/null
fi

tunnel_token="$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$tunnel_id/token" | jq -r '.result')"

cat <<EOF
Cloudflare Tunnel provisioned.

Arch:
  $ARCH_SLUG

Domain:
  https://$ARCH_DOMAIN

Tunnel:
  $tunnel_id

Install command:
  curl -fsSL https://install.arches.lat | bash -s -- \\
    --arch $ARCH_SLUG \\
    --mode tunnel-local \\
    --domain $ARCH_DOMAIN \\
    --admin-fid $ARCH_ADMIN_FID \\
    --email $ARCH_SUPPORT_EMAIL \\
    --tunnel-token '$tunnel_token'
EOF
