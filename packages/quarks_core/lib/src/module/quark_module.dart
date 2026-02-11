import 'package:flutter/material.dart';

abstract class QuarkModule {
  /// Unique identifier, e.g. 'quark_music'
  String get id;

  /// Display name shown in the launcher, e.g. 'Quark Music'
  String get name;

  /// Icon shown on the launcher card
  IconData get icon;

  /// Build the root widget/page for this module
  Widget buildPage();

  /// Called once when the module is first registered
  Future<void> initialize();

  /// Called when the module is unregistered or the app closes
  void dispose();
}
