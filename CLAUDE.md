# Quarks

## Filosofia
Quarks es una suite de micro-aplicaciones minimalistas diseñadas para uso personal. Cada app (llamada "Quark") debe hacer una sola cosa bien, con lo esencial y nada más. No son herramientas robustas con docenas de opciones - son apps simples, directas y funcionales.

La distribución es un maybe. Por ahora, el foco está en que funcione bien para el autor.

## Principios de diseño
- **Minimalismo radical**: Solo las features esenciales. Si no se usa a diario, no va.
- **Simplicidad de uso**: Cero curva de aprendizaje. Abrir y usar.
- **Estética pixel art**: Colores pasteles, baja saturación, fuente Silkscreen, bordes pixel art.
- **Modularidad**: Cada Quark es un paquete independiente. Quarks-core funciona solo. Los Quarks no dependen entre sí.

## Arquitectura
- **Monorepo** con Dart Pub Workspaces
- **Flutter** (Windows principal, Android/iOS secundario)
- **Riverpod** para state management
- **Frontend/Backend separados**: `presentation/` para UI, `domain/` + `data/` para lógica

### Estructura
```
lib/                   → Launcher (entry point, shell, providers, registry)
packages/quark_core/   → Core compartido: interfaz Quark, tema, widgets
packages/quark_*/      → Quarks independientes (music, etc.)
```

### Agregar un nuevo Quark
1. Crear paquete en `packages/quark_<nombre>/`
2. Implementar `Quark` de quark_core
3. Registrar en `lib/main.dart`
4. El paquete depende de `quark_core`, nunca de otros quarks

## Stack
- Dart 3.10+, Flutter 3.38+
- just_audio + just_audio_media_kit + media_kit_libs_windows_audio (audio Windows)
- file_picker (selección de archivos/carpetas)
- google_fonts (Silkscreen)

## Releases

Cuando el usuario diga **"version patch"**, **"version minor"** o **"version major"**, correr el script:

```powershell
pwsh scripts/release.ps1 patch    # 1.0.0 -> 1.0.1
pwsh scripts/release.ps1 minor    # 1.0.0 -> 1.1.0
pwsh scripts/release.ps1 major    # 1.0.0 -> 2.0.0
```

El script bumpea `pubspec.yaml`, commitea, taggea y pushea — el push del tag dispara el workflow de GitHub Actions que construye el instalador, lo sube como release y actualiza `appcast.xml`.

**Pre-condiciones que el script chequea (y aborta si no se cumplen):**
- estar en `main`
- estar al día con `origin/main`
- working tree limpio (sin cambios pendientes)
- el tag nuevo no existe ya local ni remotamente

Si el script aborta por cambios pendientes, primero commitearlos (o stashearlos) y después correr el script.