import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quark_core/quark_core.dart';

import 'presentation/pages/settings_page.dart';

class SettingsModule extends Quark {
  @override
  String get id => 'quark_settings';

  @override
  String get name => 'Quark Settings';

  @override
  IconData get icon => Icons.tune_outlined;

  @override
  Widget buildPage() => const SettingsPage();

  @override
  List<QuarkSettingOption> buildSettings(BuildContext context, WidgetRef ref) =>
      const [];

  @override
  AiContext? buildAiContext(BuildContext context, WidgetRef ref) => null;

  @override
  Future<void> initialize() async {}

  @override
  void dispose() {}
}
