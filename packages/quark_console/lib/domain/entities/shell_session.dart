class ShellSession {
  final String id;
  final String cwd;

  const ShellSession({required this.id, required this.cwd});

  ShellSession copyWith({String? cwd}) =>
      ShellSession(id: id, cwd: cwd ?? this.cwd);

  Map<String, dynamic> toJson() => {'id': id, 'cwd': cwd};

  factory ShellSession.fromJson(Map<String, dynamic> json) => ShellSession(
        id: json['id'] as String,
        cwd: json['cwd'] as String,
      );
}
