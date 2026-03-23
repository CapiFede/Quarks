import 'package:flutter/material.dart';

import 'quarks_colors.dart';

/// Extension de tema que expone todos los colores personalizados de Quarks
/// a través de Theme.of(context).extension<QuarksColorExtension>()
@immutable
class QuarksColorExtension extends ThemeExtension<QuarksColorExtension> {
  // Primary palette
  final Color background;
  final Color surface;
  final Color surfaceAlt;
  final Color primary;
  final Color primaryDark;
  final Color secondary;
  final Color secondaryDark;

  // Borders & accents
  final Color border;
  final Color borderDark;
  final Color borderLight;

  // Text
  final Color textPrimary;
  final Color textSecondary;
  final Color textLight;

  // Functional
  final Color error;
  final Color success;

  // Card states
  final Color cardHover;
  final Color cardShadow;

  const QuarksColorExtension({
    required this.background,
    required this.surface,
    required this.surfaceAlt,
    required this.primary,
    required this.primaryDark,
    required this.secondary,
    required this.secondaryDark,
    required this.border,
    required this.borderDark,
    required this.borderLight,
    required this.textPrimary,
    required this.textSecondary,
    required this.textLight,
    required this.error,
    required this.success,
    required this.cardHover,
    required this.cardShadow,
  });

  /// Light theme usando QuarksColors
  static const light = QuarksColorExtension(
    background: QuarksColors.background,
    surface: QuarksColors.surface,
    surfaceAlt: QuarksColors.surfaceAlt,
    primary: QuarksColors.primary,
    primaryDark: QuarksColors.primaryDark,
    secondary: QuarksColors.secondary,
    secondaryDark: QuarksColors.secondaryDark,
    border: QuarksColors.border,
    borderDark: QuarksColors.borderDark,
    borderLight: QuarksColors.borderLight,
    textPrimary: QuarksColors.textPrimary,
    textSecondary: QuarksColors.textSecondary,
    textLight: QuarksColors.textLight,
    error: QuarksColors.error,
    success: QuarksColors.success,
    cardHover: QuarksColors.cardHover,
    cardShadow: QuarksColors.cardShadow,
  );

  /// Dark theme usando QuarksColorsDark
  static const dark = QuarksColorExtension(
    background: QuarksColorsDark.background,
    surface: QuarksColorsDark.surface,
    surfaceAlt: QuarksColorsDark.surfaceAlt,
    primary: QuarksColorsDark.primary,
    primaryDark: QuarksColorsDark.primaryDark,
    secondary: QuarksColorsDark.secondary,
    secondaryDark: QuarksColorsDark.secondaryDark,
    border: QuarksColorsDark.border,
    borderDark: QuarksColorsDark.borderDark,
    borderLight: QuarksColorsDark.borderLight,
    textPrimary: QuarksColorsDark.textPrimary,
    textSecondary: QuarksColorsDark.textSecondary,
    textLight: QuarksColorsDark.textLight,
    error: QuarksColorsDark.error,
    success: QuarksColorsDark.success,
    cardHover: QuarksColorsDark.cardHover,
    cardShadow: QuarksColorsDark.cardShadow,
  );

  @override
  ThemeExtension<QuarksColorExtension> copyWith({
    Color? background,
    Color? surface,
    Color? surfaceAlt,
    Color? primary,
    Color? primaryDark,
    Color? secondary,
    Color? secondaryDark,
    Color? border,
    Color? borderDark,
    Color? borderLight,
    Color? textPrimary,
    Color? textSecondary,
    Color? textLight,
    Color? error,
    Color? success,
    Color? cardHover,
    Color? cardShadow,
  }) {
    return QuarksColorExtension(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      primary: primary ?? this.primary,
      primaryDark: primaryDark ?? this.primaryDark,
      secondary: secondary ?? this.secondary,
      secondaryDark: secondaryDark ?? this.secondaryDark,
      border: border ?? this.border,
      borderDark: borderDark ?? this.borderDark,
      borderLight: borderLight ?? this.borderLight,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textLight: textLight ?? this.textLight,
      error: error ?? this.error,
      success: success ?? this.success,
      cardHover: cardHover ?? this.cardHover,
      cardShadow: cardShadow ?? this.cardShadow,
    );
  }

  @override
  ThemeExtension<QuarksColorExtension> lerp(
    covariant ThemeExtension<QuarksColorExtension>? other,
    double t,
  ) {
    if (other is! QuarksColorExtension) {
      return this;
    }

    return QuarksColorExtension(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceAlt: Color.lerp(surfaceAlt, other.surfaceAlt, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      primaryDark: Color.lerp(primaryDark, other.primaryDark, t)!,
      secondary: Color.lerp(secondary, other.secondary, t)!,
      secondaryDark: Color.lerp(secondaryDark, other.secondaryDark, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderDark: Color.lerp(borderDark, other.borderDark, t)!,
      borderLight: Color.lerp(borderLight, other.borderLight, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textLight: Color.lerp(textLight, other.textLight, t)!,
      error: Color.lerp(error, other.error, t)!,
      success: Color.lerp(success, other.success, t)!,
      cardHover: Color.lerp(cardHover, other.cardHover, t)!,
      cardShadow: Color.lerp(cardShadow, other.cardShadow, t)!,
    );
  }
}

/// Helper extension para acceso más corto
extension QuarksColorExtensionGetter on BuildContext {
  QuarksColorExtension get quarksColors =>
      Theme.of(this).extension<QuarksColorExtension>()!;
}
