# Arches Domain Setup

The first public scaffold uses static hosting for both the marketing site and
the installer endpoint.

## DNS Targets

- `arches.lat`: landing page for Arches.
- `install.arches.lat`: raw installer script endpoint.

Point both records at the static host that serves the `site/` directory. The
exact DNS value depends on that host. Common setups use `A` or `AAAA` records
for a static web server, or `CNAME` records for a managed static hosting
provider.

## Static Paths

- `site/index.html` is the `arches.lat` homepage.
- `site/install` is the raw installer script.

Configure `install.arches.lat` so its root path serves the raw contents of
`site/install`. If the host serves the same static directory for both domains,
route or rewrite `https://install.arches.lat/` to `/install`.

The installer is static. It validates the requested Arch config, renders the
Docker Compose appliance files, and optionally starts Docker services when the
caller passes `--yes`.

## Local Hosting Check

From the repo root:

```bash
python3 -m http.server 8080 --directory site
```

Then open:

- `http://localhost:8080/` for the landing page.
- `http://localhost:8080/install` for the raw installer script.

Use the raw script locally with:

```bash
curl -fsSL http://localhost:8080/install | \
  ARCHES_INSTALL_DIR=/tmp/arches-site-local bash -s -- \
  --arch anky \
  --mode local \
  --admin-fid 123 \
  --email support@example.com
```
