import 'package:flutter/material.dart';

abstract final class QuarksColors {
  // ── Paleta C — Marfil + Sage ──────────────────────────────────────────────

  // Base
  static const background = Color(0xFFF2EDE4); // beige marfil
  static const surface    = Color(0xFFFAF8F3); // crema blanca suave
  static const surfaceAlt = Color(0xFFEAE5DC); // beige medio

  // Primary — verde sage-aquamarine
  static const primary     = Color(0xFF568070);
  static const primaryDark = Color(0xFF3E6054);

  // Secondary — sage más suave
  static const secondary     = Color(0xFF7A9E8E);
  static const secondaryDark = Color(0xFF5A7C6C);

  // Borders — grisáceo cálido
  static const border      = Color(0xFFD8D2C8);
  static const borderDark  = Color(0xFFC4BDB2);
  static const borderLight = Color(0xFFF4F1EC);

  // Text
  static const textPrimary   = Color(0xFF32382C);
  static const textSecondary = Color(0xFF4A5444);
  static const textLight     = Color(0xFF8A9484);

  // Functional
  static const error   = Color(0xFFC08080);
  static const success = Color(0xFF70A870);

  // Card states
  static const cardHover  = Color(0xFFEDE9E2);
  static const cardShadow = Color(0x26568070); // primary @ 15%
}

abstract final class QuarksColorsDark {
  // ── Paleta C dark — grises neutros, inspirado en Discord ─────────────────

  // Base — fondos gris neutro sin tinte verde
  static const background = Color(0xFF1E1F22);
  static const surface    = Color(0xFF2B2D31);
  static const surfaceAlt = Color(0xFF313338);

  // Primary — mismo sage, visible sobre fondos oscuros
  static const primary     = Color(0xFF568070);
  static const primaryDark = Color(0xFF3E6054);

  // Secondary
  static const secondary     = Color(0xFF4A6E5E);
  static const secondaryDark = Color(0xFF385248);

  // Borders — grises neutros
  static const border      = Color(0xFF3A3B3E);
  static const borderDark  = Color(0xFF2A2B2E);
  static const borderLight = Color(0xFF4E4F52);

  // Text — casi blanco neutro
  static const textPrimary   = Color(0xFFDCDDDE);
  static const textSecondary = Color(0xFF8E9297);
  static const textLight     = Color(0xFF5C5E66);

  // Functional
  static const error   = Color(0xFFC08080);
  static const success = Color(0xFF70A870);

  // Card states
  static const cardHover  = Color(0xFF35373C);
  static const cardShadow = Color(0x40000000);
}
