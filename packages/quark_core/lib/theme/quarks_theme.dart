import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'quarks_colors.dart';
import 'quarks_color_extension.dart';

abstract final class QuarksTheme {
  static ThemeData get theme {
    final textTheme = _buildTextTheme(QuarksColors.textPrimary, QuarksColors.textSecondary);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: QuarksColors.background,
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      splashColor: Colors.transparent,
      colorScheme: const ColorScheme.light(
        primary: QuarksColors.primary,
        onPrimary: QuarksColors.surface,
        secondary: QuarksColors.secondary,
        onSecondary: QuarksColors.textPrimary,
        surface: QuarksColors.surface,
        onSurface: QuarksColors.textPrimary,
        error: QuarksColors.error,
      ),
      extensions: const [
        QuarksColorExtension.light,
      ],
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: QuarksColors.primary,
        foregroundColor: QuarksColors.surface,
        elevation: 0,
        titleTextStyle: textTheme.titleMedium?.copyWith(
          color: QuarksColors.surface,
        ),
      ),
      cardTheme: const CardThemeData(
        color: QuarksColors.surface,
        elevation: 0,
        margin: EdgeInsets.all(8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: QuarksColors.border, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: const WidgetStatePropertyAll(Colors.transparent),
          foregroundColor: const WidgetStatePropertyAll(QuarksColors.textPrimary),
          overlayColor: WidgetStatePropertyAll(
            QuarksColors.primary.withValues(alpha: 0.1),
          ),
          side: const WidgetStatePropertyAll(
            BorderSide(color: QuarksColors.border, width: 1),
          ),
          shape: const WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          ),
          elevation: const WidgetStatePropertyAll(0),
          textStyle: WidgetStatePropertyAll(textTheme.labelLarge),
        ),
      ),
      iconTheme: const IconThemeData(
        color: QuarksColors.textPrimary,
        size: 24,
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: QuarksColors.primary,
        inactiveTrackColor: QuarksColors.border,
        thumbColor: QuarksColors.primaryDark,
        trackHeight: 4,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: QuarksColors.surface,
        unselectedLabelColor: QuarksColors.textLight,
        indicator: const UnderlineTabIndicator(
          borderSide: BorderSide(color: QuarksColors.surface, width: 2),
        ),
        labelStyle: textTheme.labelLarge,
        unselectedLabelStyle: textTheme.labelMedium,
      ),
    );
  }

  static ThemeData get darkTheme {
    final textTheme = _buildTextTheme(QuarksColorsDark.textPrimary, QuarksColorsDark.textSecondary);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: QuarksColorsDark.background,
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      splashColor: Colors.transparent,
      colorScheme: const ColorScheme.dark(
        primary: QuarksColorsDark.primary,
        onPrimary: QuarksColorsDark.surface,
        secondary: QuarksColorsDark.secondary,
        onSecondary: QuarksColorsDark.textPrimary,
        surface: QuarksColorsDark.surface,
        onSurface: QuarksColorsDark.textPrimary,
        error: QuarksColorsDark.error,
      ),
      extensions: const [
        QuarksColorExtension.dark,
      ],
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: QuarksColorsDark.primary,
        foregroundColor: QuarksColorsDark.surface,
        elevation: 0,
        titleTextStyle: textTheme.titleMedium?.copyWith(
          color: QuarksColorsDark.surface,
        ),
      ),
      cardTheme: const CardThemeData(
        color: QuarksColorsDark.surface,
        elevation: 0,
        margin: EdgeInsets.all(8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: QuarksColorsDark.border, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: const WidgetStatePropertyAll(Colors.transparent),
          foregroundColor: const WidgetStatePropertyAll(QuarksColorsDark.textPrimary),
          overlayColor: WidgetStatePropertyAll(
            QuarksColorsDark.primary.withValues(alpha: 0.1),
          ),
          side: const WidgetStatePropertyAll(
            BorderSide(color: QuarksColorsDark.border, width: 1),
          ),
          shape: const WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          ),
          elevation: const WidgetStatePropertyAll(0),
          textStyle: WidgetStatePropertyAll(textTheme.labelLarge),
        ),
      ),
      iconTheme: const IconThemeData(
        color: QuarksColorsDark.textPrimary,
        size: 24,
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: QuarksColorsDark.primary,
        inactiveTrackColor: QuarksColorsDark.border,
        thumbColor: QuarksColorsDark.primaryDark,
        trackHeight: 4,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: QuarksColorsDark.surface,
        unselectedLabelColor: QuarksColorsDark.textLight,
        indicator: const UnderlineTabIndicator(
          borderSide: BorderSide(color: QuarksColorsDark.surface, width: 2),
        ),
        labelStyle: textTheme.labelLarge,
        unselectedLabelStyle: textTheme.labelMedium,
      ),
    );
  }

  static TextTheme _buildTextTheme(Color primary, Color secondary) {
    final base = GoogleFonts.tiny5TextTheme();

    return base.copyWith(
      displayLarge: base.displayLarge?.copyWith(
        color: primary,
        fontSize: 32,
      ),
      titleLarge: base.titleLarge?.copyWith(
        color: primary,
        fontSize: 22,
      ),
      titleMedium: base.titleMedium?.copyWith(
        color: primary,
        fontSize: 17,
      ),
      titleSmall: base.titleSmall?.copyWith(
        color: secondary,
        fontSize: 15,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        color: primary,
        fontSize: 15,
      ),
      bodyMedium: base.bodyMedium?.copyWith(
        color: primary,
        fontSize: 13,
      ),
      bodySmall: base.bodySmall?.copyWith(
        color: secondary,
        fontSize: 11,
      ),
      labelLarge: base.labelLarge?.copyWith(
        color: primary,
        fontSize: 13,
      ),
      labelMedium: base.labelMedium?.copyWith(
        color: secondary,
        fontSize: 11,
      ),
    );
  }
}
