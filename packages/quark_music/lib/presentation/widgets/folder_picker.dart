import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quarks_core/quarks_core.dart';

import '../providers/music_providers.dart';

class FolderPicker extends ConsumerWidget {
  const FolderPicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(playerProvider);
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Expanded(
            child: PixelBorder(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Text(
                state.scannedFolder ?? 'No folder selected',
                style: theme.textTheme.bodySmall,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: state.isScanning
                ? null
                : () => ref.read(playerProvider.notifier).pickAndScanFolder(),
            child: Text(state.isScanning ? 'Scanning...' : 'Scan Folder'),
          ),
        ],
      ),
    );
  }
}
