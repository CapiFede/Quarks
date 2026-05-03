import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'quark_settings.dart';

abstract class Quark {
  /// Unique identifier, e.g. 'quark_music'
  String get id;

  /// Display name shown in the launcher, e.g. 'Quark Music'
  String get name;

  /// Icon shown on the launcher card
  IconData get icon;

  /// Build the root widget/page for this quark
  Widget buildPage();

  /// Options shown in the per-Quark settings gear menu. Right-clicking any
  /// pinneable option toggles its presence on the toolbar's quick-access side.
  /// Default: no options.
  List<QuarkSettingOption> buildSettings(BuildContext context, WidgetRef ref) =>
      const [];

  /// Dynamic pinneable items (e.g. playlist chips) that the Quark wants
  /// rendered on the toolbar between the gear and the pinned-settings icons.
  /// The Quark is responsible for filtering its own items by whatever pin
  /// state it tracks; the toolbar just renders them in order.
  List<QuarkPinnedItem> buildDynamicPinned(
          BuildContext context, WidgetRef ref) =>
      const [];

  /// Optional overlay rendered on top of both the per-Quark toolbars and the
  /// page itself, filling the entire tab area below the global title bar.
  /// Use this for drawers/popovers that should slide in over the toolbars.
  Widget? buildOverlay(BuildContext context, WidgetRef ref) => null;

  /// Called once when the quark is first registered
  Future<void> initialize();

  /// Called when the quark is unregistered or the app closes
  void dispose();
}
