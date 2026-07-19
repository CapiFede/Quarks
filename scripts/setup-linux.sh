#!/usr/bin/env bash
#
# setup-linux.sh — Setup de un equipo Arch/CachyOS limpio para desarrollar Quarks.
#
# Instala el toolchain nativo de Tauri v2 (WebKitGTK + Rust), Node + pnpm,
# el audio del WebView (GStreamer) y los binarios del quark de música.
# Idempotente: usa `pacman --needed`, así que correrlo de nuevo no rompe nada.
#
# Ref: .claude/knowledge/LinuxDev.md
#
# Uso:
#   ./scripts/setup-linux.sh            # todo (dev + audio + música)
#   ./scripts/setup-linux.sh --release  # además, deps para `pnpm tauri build` (AppImage)
#   ./scripts/setup-linux.sh --minimal  # solo lo imprescindible para `pnpm dev`

set -euo pipefail

WITH_RELEASE=0
MINIMAL=0
for arg in "$@"; do
  case "$arg" in
    --release) WITH_RELEASE=1 ;;
    --minimal) MINIMAL=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Argumento desconocido: $arg (usá --help)"; exit 1 ;;
  esac
done

# --- Sanity checks -----------------------------------------------------------

if ! command -v pacman >/dev/null 2>&1; then
  echo "ERROR: este script es para Arch/CachyOS (necesita pacman)." >&2
  exit 1
fi

if [[ $EUID -eq 0 ]]; then
  echo "ERROR: no lo corras como root. Usa tu usuario; pediré sudo cuando haga falta." >&2
  exit 1
fi

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

pac() {
  log "$1"
  shift
  sudo pacman -S --needed --noconfirm "$@"
}

# --- 1. Toolchain base (obligatorio para `pnpm dev`) -------------------------

pac "WebView de Tauri v2 + utilidades de bundling" \
  webkit2gtk-4.1 base-devel curl wget file openssl librsvg gtk3 libsoup3

pac "Node + pnpm" nodejs pnpm

pac "Rust (rustup)" rustup
# rustup queda sin toolchain por default en Arch; lo fijamos a stable.
if ! rustup show active-toolchain >/dev/null 2>&1; then
  log "Fijando toolchain stable de Rust"
  rustup default stable
fi

# --- 2. Audio del WebView (GStreamer) ----------------------------------------

if [[ $MINIMAL -eq 0 ]]; then
  pac "Audio del WebView (GStreamer + salida PipeWire)" \
    gst-plugins-base gst-plugins-good gst-plugin-pipewire
fi

# --- 3. Quark de música (yt-dlp + ffmpeg) ------------------------------------

if [[ $MINIMAL -eq 0 ]]; then
  pac "Binarios del quark de música (yt-dlp + ffmpeg)" yt-dlp ffmpeg
fi

# --- 4. Deps de release / AppImage (opcional) --------------------------------

if [[ $WITH_RELEASE -eq 1 ]]; then
  pac "Bundling y ejecución de AppImage" patchelf fuse2
fi

# --- 5. Deps JS del workspace ------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log "Instalando deps JS del workspace (pnpm install)"
( cd "$REPO_ROOT" && pnpm install )

# --- Listo -------------------------------------------------------------------

printf '\n\033[1;32m✓ Setup completo.\033[0m\n'
cat <<'EOF'

  pnpm dev            # tauri dev: compila Rust + frontend en :1420
  pnpm tauri build    # bundle de release (.AppImage + .deb)  [requiere --release]

Si abrís una shell nueva y `cargo`/`rustc` no aparecen, recargá el PATH de rustup
o reabrí la terminal.
EOF
