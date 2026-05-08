import 'package:flutter/material.dart';

import '../widgets/shell_tabs_view.dart';

class ConsolePage extends StatelessWidget {
  const ConsolePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF1A1B20),
      child: const ShellTabsView(),
    );
  }
}
