#!/usr/bin/env bash
#
# Setup de entorno de desarrollo para Quarks en Debian/Ubuntu.
# Instala las deps nativas de Tauri v2 + las específicas del repo (ALSA para
# rodio), Rust vía rustup y pnpm vía corepack, y deja el repo listo con
# `pnpm install`. Idempotente: se puede correr varias veces sin romper nada.
#
# Uso:  ./scripts/setup-debian.sh
#
set -euo pipefail

# --- helpers de output ---------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi
step() { printf '\n%s==>%s %s\n' "$BOLD" "$RESET" "$1"; }
ok()   { printf '%s  ✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '%s  !%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '%s  ✗%s %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }

# --- 0. sanity checks ----------------------------------------------------
[ "$(id -u)" -eq 0 ] && die "No lo corras como root — usa tu usuario; el script pide sudo solo para apt."
command -v apt-get >/dev/null 2>&1 || die "Este script es para Debian/Ubuntu (no encontré apt-get)."

# Ubicarse en la raíz del repo (un nivel arriba de scripts/), pase lo que pase.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if command -v lsb_release >/dev/null 2>&1; then
  step "Distro: $(lsb_release -ds)"
else
  step "Distro: $(. /etc/os-release && echo "$PRETTY_NAME")"
fi

# --- 1. librerías del sistema (Tauri v2 + ALSA para rodio) ---------------
step "Instalando librerías del sistema (apt)…"
APT_PKGS=(
  libwebkit2gtk-4.1-dev        # WebView de Tauri v2
  build-essential curl wget file pkg-config
  libxdo-dev
  libssl-dev
  libayatana-appindicator3-dev # tray / app indicator
  librsvg2-dev
  libasound2-dev               # ALSA — lo necesita rodio/cpal para compilar
  libglib2.0-dev
)
sudo apt-get update
sudo apt-get install -y "${APT_PKGS[@]}"
ok "Librerías del sistema instaladas."

# --- 2. Rust (rustup) ----------------------------------------------------
# El repo pide rust-version >= 1.77.2. Usamos rustup, no el rustc de apt.
MIN_RUST="1.77.2"
if command -v rustc >/dev/null 2>&1; then
  ok "Rust ya presente: $(rustc --version)"
else
  step "Instalando Rust vía rustup…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
  ok "Rust instalado: $(rustc --version)"
  warn "Abrí una terminal nueva o corré '. \$HOME/.cargo/env' para tener cargo en el PATH."
fi

# --- 3. Node + pnpm ------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node no está instalado. Instalá Node >= 20 (nvm o apt) y volvé a correr esto."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) es muy viejo — el repo pide >= 20."
ok "Node $(node -v)"

step "Instalando pnpm (standalone)…"
# NO usamos corepack: el corepack que empaqueta el node de Debian/Ubuntu (apt) es
# viejo e incompatible con pnpm 10/11 — rompe con ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING
# al cargar pnpm. El instalador standalone trae su propio runtime y vive en userland.
PNPM_PIN="11.3.0"
if command -v pnpm >/dev/null 2>&1 && pnpm -v >/dev/null 2>&1; then
  ok "pnpm ya presente: $(pnpm -v)"
else
  # Si quedó un shim roto de corepack en el PATH, lo sacamos (best-effort).
  if command -v corepack >/dev/null 2>&1; then sudo corepack disable >/dev/null 2>&1 || true; fi
  curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_PIN" sh -
  # Dejar pnpm disponible en ESTA sesión para el `pnpm install` de abajo.
  export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
  export PATH="$PNPM_HOME:$PATH"
  ok "pnpm $(pnpm -v)"
  warn "Abrí una terminal nueva o corré 'source ~/.bashrc' para tener pnpm en el PATH."
fi

# --- 4. deps del repo ----------------------------------------------------
step "Instalando dependencias del workspace (pnpm install)…"
pnpm install
ok "Dependencias instaladas."

# --- listo ---------------------------------------------------------------
cat <<EOF

${GREEN}${BOLD}Todo listo.${RESET} Para arrancar la app:

  ${BOLD}pnpm dev${RESET}      # = tauri dev (la 1ra compilación de Rust tarda unos minutos)

Notas:
  · ffmpeg/yt-dlp NO hace falta instalarlos: el quark de música los baja solo.
  · Los secretos (keyring) usan Secret Service (D-Bus). En un Debian con
    GNOME/KDE ya hay backend; en un entorno pelado instalá 'gnome-keyring'.
EOF
