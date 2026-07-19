## Filosofia
Quarks es una suite de micro-aplicaciones minimalistas diseñadas para uso personal y de amigos. Cada app (llamada "Quark") debe hacer una sola cosa bien, con lo esencial y nada más. No son herramientas robustas con docenas de opciones - son apps simples, directas y funcionales.

## Principios de diseño
- **Minimalismo radical**: Solo las features esenciales. Si no se usa a diario, no va.
- **Simplicidad de uso**: Cero curva de aprendizaje. Abrir y usar.
- **Modularidad**: Cada Quark es un paquete independiente. Quarks-core funciona solo. Los Quarks no dependen entre sí.

## Plataforma
Linux es la **plataforma primaria** de Quarks (desarrollo y releases se cortan desde Linux). Windows y macOS son secundarios; Android está en porte. Al tocar código de plataforma, priorizá que funcione en Linux.

## Conocimiento de referencia
Documentación de referencia del proyecto en `.claude/knowledge/`. Consultala antes de tareas estructurales.
- `LinuxDev.md` — dependencias del sistema para compilar/correr en Linux (Arch/CachyOS). Consultala al setupear un equipo nuevo o si el build falla por una dep nativa.
- `QuarkStructure.md` — estructura canónica de un quark y qué va en cada carpeta. Seguila al crear un nuevo quark.
- `StorageLayout.md` — dónde vive cada archivo en disco (globales, spaces, contenido por quark) y qué sincroniza con Drive. Consultala antes de tocar persistencia, sync o el arranque.
- `AndroidOAuth.md` — cómo funciona el login de Google Drive en Android (custom URI scheme + deep link). Consultala si tocás el flow de OAuth o si hay que regenerar `gen/android/`.
- `ReleaseUpdates.md` — cómo cortar un release y cómo funciona el canal de updates (GitHub Releases + firma ed25519). Consultala antes de tocar versionado, firma o el panel de Acerca de.
