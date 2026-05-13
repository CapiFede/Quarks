/// Provider-neutral declaration of a tool the model can call.
///
/// [inputSchema] is a JSON Schema fragment describing the arguments —
/// each provider maps it onto its native function-calling format.
class ToolDefinition {
  final String name;
  final String description;
  final Map<String, dynamic> inputSchema;

  const ToolDefinition({
    required this.name,
    required this.description,
    required this.inputSchema,
  });
}
