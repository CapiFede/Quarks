export 'providers/pin_providers.dart';
export 'quark.dart';
export 'quark_registry.dart';
export 'quark_settings.dart';
export 'services/log_service.dart';
export 'services/pin_storage_service.dart';
export 'theme/quarks_color_extension.dart';
export 'theme/quarks_colors.dart';
export 'theme/quarks_theme.dart';
export 'widgets/pixel_border.dart';
export 'widgets/quark_color_picker.dart';
export 'widgets/quark_toolbar.dart';

// AI chat module — public surface used by quarks that want to contribute
// context, plus the global drawer widget the launcher mounts.
export 'ai/domain/ai_attachment.dart';
export 'ai/domain/ai_context.dart';
export 'ai/domain/llm_model.dart';
export 'ai/domain/tool_definition.dart';
export 'ai/presentation/providers/ai_context_provider.dart'
    show activeQuarkProvider, quarkRegistryProvider;
export 'ai/presentation/providers/agent_md_providers.dart'
    show
        generalAgentMdProvider,
        GeneralAgentMdNotifier,
        quarkAgentMdProvider,
        QuarkAgentMdNotifier;
export 'ai/presentation/providers/chat_providers.dart'
    show
        aiDrawerOpenProvider,
        aiDrawerWidthProvider,
        activeConversationIdProvider,
        chatStreamingProvider,
        pendingAttachmentsProvider,
        conversationSummariesProvider,
        conversationProvider;
export 'ai/presentation/providers/llm_providers.dart'
    show activeModelProvider, availableModelsProvider;
export 'ai/presentation/widgets/ai_drawer/ai_drawer.dart' show AiDrawer;
