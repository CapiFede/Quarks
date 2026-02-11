import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'quarks_colors.dart';

abstract final class QuarksTheme {
  static ThemeData get theme {
    final textTheme = _buildTextTheme();

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: QuarksColors.background,
      colorScheme: const ColorScheme.light(
        primary: QuarksColors.primary,
        onPrimary: QuarksColors.surface,
        secondary: QuarksColors.secondary,
        onSecondary: QuarksColors.textPrimary,
        surface: QuarksColors.surface,
        onSurface: QuarksColors.textPrimary,
        error: QuarksColors.error,
      ),
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
        style: ElevatedButton.styleFrom(
          backgroundColor: QuarksColors.secondary,
          foregroundColor: QuarksColors.textPrimary,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.zero,
          ),
          textStyle: textTheme.labelLarge,
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

  static TextTheme _buildTextTheme() {
    final base = GoogleFonts.silkscreenTextTheme();

    return base.copyWith(
      displayLarge: base.displayLarge?.copyWith(
        color: QuarksColors.textPrimary,
        fontSize: 32,
      ),
      titleLarge: base.titleLarge?.copyWith(
        color: QuarksColors.textPrimary,
        fontSize: 20,
      ),
      titleMedium: base.titleMedium?.copyWith(
        color: QuarksColors.textPrimary,
        fontSize: 16,
      ),
      titleSmall: base.titleSmall?.copyWith(
        color: QuarksColors.textSecondary,
        fontSize: 14,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        color: QuarksColors.textPrimary,
        fontSize: 14,
      ),
      bodyMedium: base.bodyMedium?.copyWith(
        color: QuarksColors.textPrimary,
        fontSize: 12,
      ),
      bodySmall: base.bodySmall?.copyWith(
        color: QuarksColors.textSecondary,
        fontSize: 10,
      ),
      labelLarge: base.labelLarge?.copyWith(
        color: QuarksColors.textPrimary,
        fontSize: 12,
      ),
      labelMedium: base.labelMedium?.copyWith(
        color: QuarksColors.textSecondary,
        fontSize: 10,
      ),
    );
  }
}
