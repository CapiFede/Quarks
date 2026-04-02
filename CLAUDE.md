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

Cuando el usuario diga **"version patch"**, **"version minor"** o **"version major"**:

1. Leer la versión actual de `pubspec.yaml`
2. Calcular la nueva versión según el tipo:
   - `patch`: 1.0.0 → 1.0.1
   - `minor`: 1.0.0 → 1.1.0
   - `major`: 1.0.0 → 2.0.0
3. Actualizar `version` en `pubspec.yaml` con la nueva versión (sin build number, ej. `1.0.1`)
4. Ejecutar los siguientes comandos git en orden:
   - **Primero**: leer el diff de todos los archivos modificados (`git diff`) para entender qué hay pendiente y armar un mensaje de commit apropiado
   - **Segundo**: commitear **todos** los cambios pendientes (staged y unstaged), incluyendo archivos no commiteados que no sean `pubspec.yaml`
   - **Tercero**: commitear el bump de versión en `pubspec.yaml`
   - **Cuarto**: tag y push

```bash
# Commitear todos los cambios previos (excepto pubspec.yaml si ya fue modificado)
git add -A -- ':!pubspec.yaml'
git commit -m "chore: release vX.Y.Z"

# Bump de versión
git add pubspec.yaml
git commit -m "chore: bump version to vX.Y.Z"

git tag vX.Y.Z
git push && git push --tags
```

> Si no hay cambios previos pendientes, omitir el primer commit y hacer solo el bump.