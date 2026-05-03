# Plan: Reestructurar Quarks con Design System Marfil+Sage v3

**TL;DR:** La arquitectura temática actual es correcta y ya usa `context.quarksColors` en todos los widgets. Los cambios se concentran en 3 archivos de `quark_core`. No hay que tocar ningún widget de presentación.

---

## Fase 1 — Paleta de colores
**Archivo:** `packages/quark_core/lib/theme/quarks_colors.dart`

Reemplazar todos los valores hex del marrón/tostado legacy por Marfil+Sage v3. También agregar `primaryLight` que el CSS define pero el Dart actual no tiene.

**Light** — cambios clave: background `#F5E6D3→#F2EDE4`, primary `#C4956A→#568070` (de tostado a sage verde), textPrimary `#5C4A3A→#32382C`, y toda la gama.  
**Dark** — Discord-inspired: background `#2A2420→#1E1F22`, surface `#332C26→#2B2D31`, primary pasa a ser el mismo sage `#568070` (en el actual era diferente).

Nuevo campo: `primaryLight = #72A090` (en ambas clases).

### QuarksColors (Light)

| Campo | Actual | Nuevo |
|---|---|---|
| background | #F5E6D3 | #F2EDE4 |
| surface | #FFF2E6 | #FAF8F3 |
| surfaceAlt | #EDE0D0 | #EAE5DC |
| primary | #C4956A | #568070 |
| primaryDark | #A07850 | #3E6054 |
| **primaryLight** | *(no existe)* | #72A090 ← NUEVO |
| secondary | #B8C4A0 | #7A9E8E |
| secondaryDark | #8FA076 | #5A7C6C |
| border | #D4B896 | #D8D2C8 |
| borderDark | #B89B78 | #C4BDB2 |
| borderLight | #FFF5E8 | #F4F1EC |
| textPrimary | #5C4A3A | #32382C |
| textSecondary | #8B7355 | #4A5444 |
| textLight | #AA9578 | #8A9484 |
| error | #CC8B8B | #C08080 |
| success | #8BCC8B | #70A870 |
| cardHover | #FFF8F0 | #EDE9E2 |
| cardShadow | 0x30B89B78 | 0x26568070 (rgba 86,128,112, 0.15) |

### QuarksColorsDark

| Campo | Actual | Nuevo |
|---|---|---|
| background | #2A2420 | #1E1F22 |
| surface | #332C26 | #2B2D31 |
| surfaceAlt | #3D342D | #313338 |
| primary | #9B7A58 | #568070 (mismo que light) |
| primaryDark | #7A6048 | #3E6054 |
| **primaryLight** | *(no existe)* | #72A090 ← NUEVO |
| secondary | #6B7A5C | #4A6E5E |
| secondaryDark | #546344 | #385248 |
| border | #504038 | #3A3B3E |
| borderDark | #3D332C | #2A2B2E |
| borderLight | #5C4E44 | #4E4F52 |
| textPrimary | #D4C4B0 | #DCDDDE |
| textSecondary | #A89880 | #8E9297 |
| textLight | #7A6C5C | #5C5E66 |
| error | #CC8B8B | #C08080 (igual) |
| success | #8BCC8B | #70A870 |
| cardHover | #3D352E | #35373C |
| cardShadow | 0x40000000 | 0x4D000000 (rgba 0,0,0, 0.3) |

---

## Fase 2 — Color Extension
**Archivo:** `packages/quark_core/lib/theme/quarks_color_extension.dart`

Agregar campo `primaryLight` a la clase, constructor, instancias `light`/`dark`, `copyWith()` y `lerp()`.

---

## Fase 3 — Tipografía
**Archivo:** `packages/quark_core/lib/theme/quarks_theme.dart`

- Cambiar `GoogleFonts.silkscreenTextTheme()` → `GoogleFonts.tiny5TextTheme()`
- Actualizar type scale (los tamaños del CSS son ligeramente más grandes):

| Slot | Actual | Nuevo |
|---|---|---|
| displayLarge | 32px | 32px (igual) |
| titleLarge | 20px | 22px |
| titleMedium | 16px | 17px |
| titleSmall | 14px | 15px |
| bodyLarge | 14px | 15px |
| bodyMedium | 12px | 13px |
| bodySmall | 10px | 11px |
| labelLarge | 12px | 13px |
| labelMedium | 10px | 11px |

---

## Fase 4 — Estilo de botones
**Archivo:** `packages/quark_core/lib/theme/quarks_theme.dart`

El nuevo `ActionButton` del Design System cambia el paradigma: ya no es `secondary` como fondo relleno, sino **transparente con 1px de borde**, con hover en sage al 10%.

Actualizar `elevatedButtonTheme`:
- `backgroundColor` → `transparent`
- `side` → `BorderSide(color: border, width: 1)`
- `overlayColor` → `primary` al 10% (para el hover)
- `foregroundColor` → `textPrimary`

---

## Archivos a modificar

- `packages/quark_core/lib/theme/quarks_colors.dart` — Fase 1
- `packages/quark_core/lib/theme/quarks_color_extension.dart` — Fase 2
- `packages/quark_core/lib/theme/quarks_theme.dart` — Fases 3 y 4

**No requieren cambios:** todos los widgets de presentación (quark_music, shell, QuarkCard, PixelBorder) ya usan `context.quarksColors` y heredan los cambios automáticamente.

---

## Verificación

1. `flutter run` — confirmar que compila sin errores
2. Verificar modo claro: fondo beige marfil (#F2EDE4), acentos sage (#568070)
3. Verificar modo oscuro: fondo gris Discord (#1E1F22), mismo sage
4. Verificar botones: borde fino en lugar de fondo relleno
5. Verificar tipografía: fuente Tiny5 visible en toda la UI
6. Confirmar que `context.quarksColors.primaryLight` es accesible sin error

---

## Consideraciones adicionales

1. `GoogleFonts.tiny5TextTheme()` — Tiny5 está en el catálogo de Google Fonts desde 2023; el paquete `google_fonts` debería soportarlo. Si falla, alternativa: usar `GoogleFonts.tiny5()` manualmente en cada `copyWith`.
2. El cambio de botón de `ElevatedButton` a estilo outline puede afectar visualmente los controles del music player si usan `ElevatedButton` directamente — conveniente verificar post-implementación.
