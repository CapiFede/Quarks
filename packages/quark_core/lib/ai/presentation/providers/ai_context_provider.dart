import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../quark.dart';
import '../../../quark_registry.dart';

/// The single QuarkRegistry instance. Defaults to an empty registry so
/// quark_core compiles standalone; the launcher overrides this in its
/// ProviderScope with the fully-populated registry.
final quarkRegistryProvider = Provider<QuarkRegistry>((ref) => QuarkRegistry());

/// Lookup hook the [AiDrawer] uses to find the currently-active Quark.
/// Defaults to `null` so quark_core compiles standalone; the launcher
/// overrides this in its `ProviderScope` to derive it from `tabsProvider`
/// and `quarkRegistryProvider`.
final activeQuarkProvider = Provider<Quark?>((ref) => null);
