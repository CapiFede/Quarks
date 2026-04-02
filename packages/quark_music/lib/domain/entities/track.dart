class Track {
  final String path;
  final String title;
  final String? artist;
  final String? album;
  final Duration? duration;

  const Track({
    required this.path,
    required this.title,
    this.artist,
    this.album,
    this.duration,
  });

  /// Create a Track from a file path, extracting title from filename
  factory Track.fromPath(String filePath) {
    final normalized = filePath.replaceAll('\\', '/');
    final fileName = normalized.split('/').last;
    final title = fileName.replaceAll(RegExp(r'\.[^.]+$'), '');

    return Track(path: normalized, title: title);
  }
}
