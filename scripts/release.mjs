#!/usr/bin/env node
/**
 * Script de release de Quarks.
 *
 *   pnpm release <version> [opciones]
 *
 * Hace, en orden:
 *   1. Pre-flight: semver válido, working tree limpio, branch main, env vars de
 *      firma seteadas, `gh` autenticado (a menos que `--skip-publish`).
 *   2. Bumpea la versión en:
 *        - src-tauri/tauri.conf.json
 *        - src-tauri/Cargo.toml
 *        - core/package.json
 *        - package.json
 *      pnpm-lock.yaml se refresca con `pnpm install`.
 *   3. Commit "release: vX.Y.Z" + tag local.
 *   4. `pnpm tauri build` (firma el binario porque las env vars TAURI_SIGNING_*
 *      están exportadas — chequeado en el paso 1).
 *   5. Arma `latest.json` con la firma y la URL del asset.
 *   6. `git push && git push --tags`.
 *   7. `gh release create vX.Y.Z` subiendo `.exe`, `.exe.sig` y `latest.json`.
 *
 * Opciones:
 *   --notes "texto"        Changelog del release (también lo usa el banner del updater).
 *   --notes-file PATH      Lee el changelog de un archivo (alternativa a --notes).
 *   --skip-publish         Hace todo menos `git push` y `gh release create` (queda
 *                          la build, el tag local y `latest.json` en disco).
 *   --dry-run              Imprime lo que haría sin tocar nada.
 *
 * Plataforma primaria: Linux. El release se corre desde el host (no
 * cross-compila): `resolveArtifacts` localiza el bundle del SO actual
 * (AppImage en Linux, NSIS en Windows, .app.tar.gz en macOS).
 *
 * Setup previo (una vez, ver .claude/knowledge/ReleaseUpdates.md):
 *   - `pnpm tauri signer generate -w ~/.tauri/quarks.key`
 *   - Pegar la pubkey en src-tauri/tauri.conf.json.
 *   - Crear `<appDataDir>/quarks.env` con las TAURI_SIGNING_* (formato
 *     dotenv: `KEY=valor` por línea). El path se deriva del `identifier` del
 *     config (en Linux: `~/.config/com.quarks.app/quarks.env`). Vive ahí
 *     adrede: la misma carpeta sincroniza con Drive vía el sync de la app,
 *     así un solo backup restaura claves + config + datos.
 *     Override: `--env-file PATH` o variables ya exportadas en el proceso
 *     (ganan al archivo).
 *   - `sudo pacman -S github-cli && gh auth login` (Arch/CachyOS).
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const TAURI_CONF = resolve(ROOT, "src-tauri/tauri.conf.json");
const CARGO_TOML = resolve(ROOT, "src-tauri/Cargo.toml");
const CORE_PKG = resolve(ROOT, "core/package.json");
const ROOT_PKG = resolve(ROOT, "package.json");

/**
 * `appDataDir` de Tauri, replicado: derivamos la carpeta del identifier del
 * config (no hardcodeamos "com.quarks.app") para que el script siga el
 * eventual rename. Las rutas matchean lo que devuelve `dirs::data_dir()` en
 * Rust por plataforma:
 *   Windows → %APPDATA% (Roaming) — esta es la que el sync de la app envía a Drive.
 *   macOS   → ~/Library/Application Support
 *   Linux   → ~/.config (XDG_CONFIG_HOME si está seteado)
 */
function getAppDataDir(identifier) {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || resolve(homedir(), "AppData", "Roaming");
    return resolve(base, identifier);
  }
  if (process.platform === "darwin") {
    return resolve(homedir(), "Library", "Application Support", identifier);
  }
  const xdg = process.env.XDG_CONFIG_HOME || resolve(homedir(), ".config");
  return resolve(xdg, identifier);
}

const IDENTIFIER = JSON.parse(readFileSync(TAURI_CONF, "utf8")).identifier;
const DEFAULT_ENV_FILE = resolve(getAppDataDir(IDENTIFIER), "quarks.env");

/**
 * En Windows, `pnpm`/`gh` son shims `.cmd` y Node no los resuelve sin shell;
 * `git` y otros ejecutables nativos sí los resuelve directo. El problema con
 * `shell: true` es que cmd.exe reparsea los args por espacios y rompe los
 * mensajes con espacio (p. ej. `git commit -m "release: vX.Y.Z"`). Solución:
 * shell solo cuando el comando lo necesita — la lista vive acá arriba para
 * evitar TDZ (run/needsShell se llaman desde el cuerpo top-level del script).
 */
const NEEDS_SHELL_WIN = new Set(["pnpm", "gh", "npm", "npx"]);

// ── Args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let versionArg = null;
let notes = "";
let skipPublish = false;
let dryRun = false;
let envFile = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--notes") notes = argv[++i] ?? "";
  else if (a === "--notes-file") {
    const p = argv[++i];
    if (!p || !existsSync(p)) die(`--notes-file: no encontré ${p}`);
    notes = readFileSync(p, "utf8").trim();
  } else if (a === "--env-file") envFile = argv[++i] ?? null;
  else if (a === "--skip-publish") skipPublish = true;
  else if (a === "--dry-run") dryRun = true;
  else if (a === "-h" || a === "--help") usage(0);
  else if (a.startsWith("--")) die(`Opción desconocida: ${a}`);
  else if (!versionArg) versionArg = a;
  else die(`Argumento extra: ${a}`);
}

if (!versionArg) usage(1);

// El primer arg puede ser un bump (`patch|minor|major`) que se aplica sobre la
// versión actual leída de tauri.conf.json, o un semver explícito (útil para
// salir con `0.5.0-beta.1` o cambios no incrementales). El semver siempre gana
// — si pasaste `patch` no hacés trampa.
const currentVersion = readJson(TAURI_CONF).version;
const version = resolveVersion(versionArg, currentVersion);
const tag = `v${version}`;

if (versionArg !== version) {
  log(`Bump ${versionArg}: ${currentVersion} → ${version}`);
}

// Cargar TAURI_SIGNING_* desde el archivo si el proceso no las tiene. El path
// es ~/.tauri/quarks.env por defecto (queda al lado de la clave privada, así
// un solo backup de esa carpeta restaura el setup completo de releases). Las
// env vars del proceso ganan al archivo — útil para overrides puntuales.
loadEnvFile(envFile ?? DEFAULT_ENV_FILE, /* required */ !!envFile);

// ── Pre-flight ───────────────────────────────────────────────────────────────

log(`Release ${tag}${dryRun ? " (dry-run)" : ""}`);

requireGit();
if (!dryRun) {
  const branch = sh("git rev-parse --abbrev-ref HEAD").trim();
  if (branch !== "main") {
    warn(`Estás en "${branch}", no en main. Continúo de todas formas — Ctrl+C para abortar.`);
  }
  const dirty = sh("git status --porcelain").trim();
  if (dirty) die("Working tree sucio. Commiteá o stasheá los cambios antes de releasear.");
  const existingTag = sh(`git tag --list ${tag}`).trim();
  if (existingTag) die(`El tag ${tag} ya existe. Bumpeá a otra versión.`);
}

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  die(
    `Falta TAURI_SIGNING_PRIVATE_KEY. Creá ${DEFAULT_ENV_FILE} con las TAURI_SIGNING_* (ver ReleaseUpdates.md) o exportalas en el shell.`,
  );
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  warn("TAURI_SIGNING_PRIVATE_KEY_PASSWORD no está seteada. Si la clave tiene password el build va a colgarse esperándola.");
}

if (!skipPublish && !dryRun) {
  if (!which("gh")) {
    die("`gh` no está en PATH. Instalá con `winget install GitHub.cli` y luego `gh auth login`. O corré con --skip-publish para armar todo localmente.");
  }
  const auth = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  if (auth.status !== 0) {
    die("`gh` no está autenticado. Corré `gh auth login` primero.");
  }
}

// Repo del endpoint del updater (para armar la URL del asset).
const repoUrl = parseRepoFromEndpoint();
log(`Repo: ${repoUrl.owner}/${repoUrl.name}`);

// ── Bump versiones ───────────────────────────────────────────────────────────

log("Bumpeando versiones…");
if (!dryRun) {
  bumpJson(TAURI_CONF, version);
  bumpJson(CORE_PKG, version);
  bumpJson(ROOT_PKG, version);
  bumpCargoTomlPackageVersion(CARGO_TOML, version);

  // Refrescar pnpm-lock con las nuevas versiones de los workspace packages.
  log("pnpm install (refresco de lockfile)…");
  run("pnpm", ["install"]);
}

// ── Commit + tag local ───────────────────────────────────────────────────────

if (!dryRun) {
  log("Commit + tag local…");
  run("git", ["add", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "core/package.json", "package.json", "pnpm-lock.yaml"]);
  run("git", ["commit", "-m", `release: ${tag}`]);
  run("git", ["tag", tag]);
}

// ── Build firmado ────────────────────────────────────────────────────────────

log("pnpm tauri build (firmando)…");
// linuxdeploy (el bundler del AppImage) trae un `strip` embebido viejo que no
// entiende la sección `.relr.dyn` (relocaciones RELR) de las libs modernas de
// Arch/CachyOS y aborta con "unknown type [0x13]". NO_STRIP salta el stripeo —
// el AppImage queda un poco más grande pero el bundle no falla. Var de
// linuxdeploy; en Windows/macOS se ignora.
if (process.platform === "linux") process.env.NO_STRIP = "true";
if (!dryRun) {
  run("pnpm", ["tauri", "build"], { stdio: "inherit" });
}

// ── Localizar artefactos ─────────────────────────────────────────────────────

// Linux es la plataforma primaria; el script corre el release de la plataforma
// host (`tauri build` solo genera bundles del SO en el que corre). Cada caso
// declara la carpeta del bundle, la clave de plataforma del updater y los
// assets a subir. Los nombres exactos los resolvemos por extensión (con
// `findByExt`) porque Tauri varía el casing/arch entre versiones — más robusto
// que hardcodear `<productName>_<version>_<arch>.<ext>`.
const productName = readJson(TAURI_CONF).productName;
const artifacts = resolveArtifacts(process.platform);

if (!dryRun) {
  if (!artifacts.installer) die(`No encuentro el instalador en ${artifacts.bundleDir}`);
  if (!artifacts.sig) die(`No encuentro la firma .sig en ${artifacts.bundleDir}. ¿Build sin TAURI_SIGNING_PRIVATE_KEY?`);
}

// Para dry-run los paths pueden no existir todavía; usamos placeholders.
const installerPath = artifacts.installer || resolve(artifacts.bundleDir, "<installer>");
const sigPath = artifacts.sig || `${installerPath}.sig`;
const assetName = basename(installerPath);

// ── Armar latest.json ────────────────────────────────────────────────────────

const signature = dryRun || !artifacts.sig ? "<signature>" : readFileSync(sigPath, "utf8").trim();
const downloadBase = `https://github.com/${repoUrl.owner}/${repoUrl.name}/releases/download/${tag}`;
const latestJson = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [artifacts.updaterKey]: {
      signature,
      url: `${downloadBase}/${encodeURIComponent(assetName)}`,
    },
  },
};
const latestPath = resolve(artifacts.bundleDir, "latest.json");
log(`Escribiendo ${latestPath}…`);
if (!dryRun) writeFileSync(latestPath, JSON.stringify(latestJson, null, 2));

// ── Publicar ─────────────────────────────────────────────────────────────────

if (skipPublish) {
  log("--skip-publish: termino acá. Artefactos en:");
  log(`  ${installerPath}`);
  log(`  ${sigPath}`);
  for (const extra of artifacts.extraAssets) log(`  ${extra}`);
  log(`  ${latestPath}`);
  log(`Tag local creado: ${tag} (no pusheado).`);
  process.exit(0);
}

if (dryRun) {
  log("Dry-run OK. No tocué nada.");
  process.exit(0);
}

log("git push (código → repo privado)…");
run("git", ["push"]);
run("git", ["push", "origin", tag]);

// El release vive en el repo que indica `plugins.updater.endpoints` (puede ser
// distinto al repo de código). Para mantener el código privado y los releases
// públicos, ese endpoint apunta a un repo público vacío que solo guarda los
// binarios + latest.json. Sin `--target`, gh crea el tag apuntando al default
// branch del repo (`main` o `master`, lo que GitHub haya seteado) — si el repo
// está totalmente vacío sin commits, falla con un mensaje pidiendo crear el
// repo / README primero.
const publicRepo = `${repoUrl.owner}/${repoUrl.name}`;
log(`gh release create ${tag} en ${publicRepo}…`);
const ghArgs = [
  "release", "create", tag,
  "--repo", publicRepo,
  "--title", tag,
  "--notes", notes || `Release ${tag}`,
  "--latest",
  installerPath,
  sigPath,
  ...artifacts.extraAssets,
  latestPath,
];
run("gh", ghArgs, { stdio: "inherit" });

log(`✓ Release ${tag} publicado en ${publicRepo}.`);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resuelve los artefactos del bundle según la plataforma host. `tauri build`
 * solo genera bundles del SO en el que corre, así que el release es per-host.
 * Devuelve:
 *   - `bundleDir`    carpeta del bundle del updater.
 *   - `updaterKey`   clave de plataforma en `latest.json` (la espera Tauri).
 *   - `installer`    archivo que la app descarga al actualizar (o null si falta).
 *   - `sig`          su `.sig` (o null).
 *   - `extraAssets`  extras a subir al release (ej. `.deb`), no van en latest.json.
 *
 * Plataforma primaria: Linux → AppImage (el único formato que el updater de
 * Tauri sabe auto-actualizar en Linux). El `.deb` se sube como conveniencia.
 */
function resolveArtifacts(platform) {
  const bundleRoot = resolve(ROOT, "src-tauri/target/release/bundle");
  if (platform === "linux") {
    const bundleDir = resolve(bundleRoot, "appimage");
    const installer = findByExt(bundleDir, ".AppImage");
    const deb = findByExt(resolve(bundleRoot, "deb"), ".deb");
    return {
      bundleDir,
      updaterKey: "linux-x86_64",
      installer,
      sig: installer ? `${installer}.sig` : findByExt(bundleDir, ".AppImage.sig"),
      extraAssets: deb ? [deb] : [],
    };
  }
  if (platform === "win32") {
    const bundleDir = resolve(bundleRoot, "nsis");
    const installer = findByExt(bundleDir, "-setup.exe");
    return {
      bundleDir,
      updaterKey: "windows-x86_64",
      installer,
      sig: installer ? `${installer}.sig` : findByExt(bundleDir, ".exe.sig"),
      extraAssets: [],
    };
  }
  if (platform === "darwin") {
    const bundleDir = resolve(bundleRoot, "macos");
    const installer = findByExt(bundleDir, ".app.tar.gz");
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    const dmg = findByExt(resolve(bundleRoot, "dmg"), ".dmg");
    return {
      bundleDir,
      updaterKey: `darwin-${arch}`,
      installer,
      sig: installer ? `${installer}.sig` : findByExt(bundleDir, ".tar.gz.sig"),
      extraAssets: dmg ? [dmg] : [],
    };
  }
  die(`Plataforma no soportada para release: ${platform}`);
}

/** Primer archivo de `dir` cuyo nombre termina en `ext` (case-insensitive), o null. */
function findByExt(dir, ext) {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => f.toLowerCase().endsWith(ext.toLowerCase()));
  return hit ? resolve(dir, hit) : null;
}

function usage(code) {
  console.log(`Uso: pnpm release <patch|minor|major|X.Y.Z> [--notes "txt" | --notes-file PATH] [--env-file PATH] [--skip-publish] [--dry-run]`);
  console.log(`     patch  X.Y.Z → X.Y.(Z+1)`);
  console.log(`     minor  X.Y.Z → X.(Y+1).0`);
  console.log(`     major  X.Y.Z → (X+1).0.0`);
  console.log(`     X.Y.Z  versión explícita (soporta `+ "`-pre`" + ` para pre-releases)`);
  process.exit(code);
}

/** Traduce `patch|minor|major` a la nueva versión, o valida el semver explícito. */
function resolveVersion(arg, current) {
  if (arg === "patch" || arg === "minor" || arg === "major") {
    const m = current.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) die(`Versión actual "${current}" no es semver — no puedo bumpear.`);
    let [, major, minor, patch] = m.map(Number);
    if (arg === "patch") patch++;
    else if (arg === "minor") { minor++; patch = 0; }
    else { major++; minor = 0; patch = 0; }
    return `${major}.${minor}.${patch}`;
  }
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(arg)) {
    die(`"${arg}" no es ni patch/minor/major ni semver válido (X.Y.Z o X.Y.Z-pre).`);
  }
  return arg;
}

/**
 * Parser dotenv mínimo. Soporta `KEY=valor`, `# comentarios` y comillas
 * opcionales alrededor del valor. Sin expansión de variables — mantenemos
 * simple porque acá solo nos importan dos secretos. Las variables ya
 * presentes en process.env no se pisan: un export explícito gana al archivo.
 *
 * `required: true` falla si el archivo no existe (el usuario lo pasó con
 * --env-file, hay que asumir que lo quiere). Con `false` (default path)
 * sigue silencioso y deja que la validación de TAURI_SIGNING_PRIVATE_KEY
 * más abajo dé el error de no-encontrado, que es más útil.
 */
function loadEnvFile(path, required) {
  if (!existsSync(path)) {
    if (required) die(`--env-file: no encontré ${path}`);
    return;
  }
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function log(msg) {
  console.log(`[release] ${msg}`);
}

function warn(msg) {
  console.warn(`[release] ⚠ ${msg}`);
}

function die(msg) {
  console.error(`[release] ✗ ${msg}`);
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" });
}

function run(cmd, args, opts = {}) {
  const useShell = needsShell(cmd);
  // Cuando spawn usa shell en Windows, cmd.exe reparsea los args concatenados
  // por espacios — un `--notes "Fix: x y z"` se rompe en pedazos. Lo
  // arreglamos quoteando args con caracteres especiales antes de pasarlos.
  // Si no se usa shell, spawn pasa cada arg como argv[N] y no hace falta.
  const finalArgs = useShell && process.platform === "win32" ? args.map(quoteWin) : args;
  const res = spawnSync(cmd, finalArgs, {
    cwd: ROOT,
    stdio: opts.stdio ?? "inherit",
    shell: useShell,
    env: process.env,
  });
  if (res.status !== 0) die(`Falló: ${cmd} ${args.join(" ")}`);
}

function needsShell(cmd) {
  return process.platform === "win32" && NEEDS_SHELL_WIN.has(cmd);
}

/** Quoteo para cmd.exe: envuelve en `"..."` si tiene whitespace o metacaracteres del shell. */
function quoteWin(arg) {
  if (!/[\s"&|<>^]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

function which(cmd) {
  const checker = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(checker, [cmd], { encoding: "utf8" });
  return res.status === 0;
}

function requireGit() {
  if (!which("git")) die("git no está en PATH.");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function bumpJson(path, newVersion) {
  const json = readJson(path);
  json.version = newVersion;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

/**
 * Cargo.toml tiene muchos `version = "..."` (uno por dependencia). Solo nos
 * importa el del bloque `[package]`. Lo hacemos por estado: una vez que vemos
 * `[package]`, tomamos el primer `version = "..."` antes de la próxima sección.
 */
function bumpCargoTomlPackageVersion(path, newVersion) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  let inPackage = false;
  let done = false;
  for (let i = 0; i < lines.length && !done; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inPackage = trimmed === "[package]";
      continue;
    }
    if (inPackage && /^version\s*=\s*".*"/.test(trimmed)) {
      lines[i] = lines[i].replace(/version\s*=\s*"[^"]*"/, `version = "${newVersion}"`);
      done = true;
    }
  }
  if (!done) die(`No pude bumpear la versión en ${path}.`);
  writeFileSync(path, lines.join("\n"));
}

/**
 * Saca owner/name de la primera URL de `plugins.updater.endpoints`. Espera
 * un endpoint estilo `https://github.com/USER/REPO/releases/...`.
 */
function parseRepoFromEndpoint() {
  const conf = readJson(TAURI_CONF);
  const endpoint = conf?.plugins?.updater?.endpoints?.[0];
  if (!endpoint) die("tauri.conf.json no tiene plugins.updater.endpoints.");
  const m = endpoint.match(/github\.com\/([^/]+)\/([^/]+)\//);
  if (!m) die(`El endpoint no parece de GitHub Releases: ${endpoint}`);
  return { owner: m[1], name: m[2] };
}
