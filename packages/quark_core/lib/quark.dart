import 'package:flutter/material.dart';

abstract class Quark {
  /// Unique identifier, e.g. 'quark_music'
  String get id;

  /// Display name shown in the launcher, e.g. 'Quark Music'
  String get name;

  /// Icon shown on the launcher card
  IconData get icon;

  /// Build the root widget/page for this quark
  Widget buildPage();

  /// Build an optional toolbar shown below the title bar when this quark is active
  Widget? buildToolbar() => null;

  /// Called once when the quark is first registered
  Future<void> initialize();

  /// Called when the quark is unregistered or the app closes
  void dispose();
}
