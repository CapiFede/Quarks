import 'package:flutter/material.dart';

/// A single option exposed in a Quark's settings gear menu.
///
/// Right-clicking the menu item toggles whether it appears as a quick-access
/// icon on the opposite side of the toolbar.
class QuarkSettingOption {
  final String id;
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool pinnable;

  const QuarkSettingOption({
    required this.id,
    required this.label,
    required this.icon,
    required this.onTap,
    this.pinnable = true,
  });
}

/// A dynamic pinneable item rendered in the Quark toolbar (e.g. a playlist
/// chip). Unlike [QuarkSettingOption] these don't appear in the gear menu —
/// the Quark builds and maintains the list of currently pinned dynamic items
/// itself (typically by watching its own state + the global pin store).
class QuarkPinnedItem {
  final String id;
  final WidgetBuilder builder;

  const QuarkPinnedItem({
    required this.id,
    required this.builder,
  });
}
