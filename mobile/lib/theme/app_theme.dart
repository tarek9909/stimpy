import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'brand.dart';
import 'typography.dart';

/// Light only: the dashboard has no dark mode in v1 (dashboard-pages 1.9), and the brand's dark bands are used
/// for specific moments, not as a theme.
ThemeData buildAppTheme() {
  final text = buildTextTheme();

  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: Brand.action,
    onPrimary: Brand.white,
    primaryContainer: Brand.actionTint,
    onPrimaryContainer: Brand.actionDeep,
    secondary: Brand.coral,
    onSecondary: Brand.ink,
    secondaryContainer: Brand.cream,
    onSecondaryContainer: Brand.ink,
    tertiary: Brand.sky,
    onTertiary: Brand.ink,
    error: Brand.danger,
    onError: Brand.white,
    surface: Brand.white,
    onSurface: Brand.ink,
    onSurfaceVariant: Brand.ink70,
    outline: Brand.controlBorder,
    outlineVariant: Brand.line,
    surfaceContainerLowest: Brand.white,
    surfaceContainerLow: Brand.panel,
    surfaceContainer: Brand.surface,
    surfaceContainerHigh: Brand.surface,
    surfaceContainerHighest: Brand.surface,
    inverseSurface: Brand.ink,
    onInverseSurface: Brand.white,
    inversePrimary: Brand.actionTint,
    shadow: Color(0xFF111111),
    scrim: Color(0xFF111111),
  );

  final buttonShape = RoundedRectangleBorder(borderRadius: Radii.mdAll);
  const buttonPadding = EdgeInsets.symmetric(horizontal: 16, vertical: 12);

  OutlineInputBorder inputBorder(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: Radii.mdAll,
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: scheme,
    fontFamily: kFontFamily,
    textTheme: text,
    primaryTextTheme: text,
    scaffoldBackgroundColor: Brand.white,
    canvasColor: Brand.white,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    splashColor: Brand.action.withValues(alpha: 0.08),
    highlightColor: Brand.action.withValues(alpha: 0.04),
    splashFactory: InkRipple.splashFactory,
    dividerColor: Brand.line,
    dividerTheme: const DividerThemeData(color: Brand.line, thickness: 1, space: 1),
    appBarTheme: AppBarTheme(
      backgroundColor: Brand.white,
      foregroundColor: Brand.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      toolbarHeight: 60,
      titleTextStyle: text.titleLarge,
      iconTheme: const IconThemeData(color: Brand.ink, size: 22),
      actionsIconTheme: const IconThemeData(color: Brand.ink70, size: 22),
      shape: const Border(bottom: BorderSide(color: Brand.line)),
      systemOverlayStyle: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
      ),
    ),
    cardTheme: CardThemeData(
      color: Brand.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: Radii.lgAll, side: const BorderSide(color: Brand.line)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.action,
        foregroundColor: Brand.white,
        disabledBackgroundColor: Brand.disabledBg,
        disabledForegroundColor: Brand.disabledFg,
        minimumSize: const Size(0, 44),
        padding: buttonPadding,
        shape: buttonShape,
        textStyle: text.labelLarge,
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Brand.ink,
        disabledForegroundColor: Brand.disabledFg,
        side: const BorderSide(color: Brand.controlBorder),
        minimumSize: const Size(0, 44),
        padding: buttonPadding,
        shape: buttonShape,
        textStyle: text.labelLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: Brand.action,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        shape: buttonShape,
        textStyle: text.labelLarge,
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: Brand.ink70,
        minimumSize: const Size(44, 44),
        shape: buttonShape,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.white,
      isDense: false,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      hintStyle: text.bodyLarge?.copyWith(color: Brand.disabledFg),
      errorStyle: text.labelMedium?.copyWith(color: Brand.danger),
      border: inputBorder(Brand.controlBorder),
      enabledBorder: inputBorder(Brand.controlBorder),
      focusedBorder: inputBorder(Brand.action, 2),
      errorBorder: inputBorder(Brand.danger),
      focusedErrorBorder: inputBorder(Brand.danger, 2),
      disabledBorder: inputBorder(Brand.line),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Brand.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 64,
      indicatorColor: Brand.action.withValues(alpha: 0.10),
      indicatorShape: RoundedRectangleBorder(borderRadius: Radii.mdAll),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
            size: 22,
            color: states.contains(WidgetState.selected) ? Brand.action : Brand.ink70,
          )),
      labelTextStyle: WidgetStateProperty.resolveWith((states) => text.labelMedium?.copyWith(
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? Brand.ink : Brand.ink70,
          )),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.ink : Brand.white),
        foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.white : Brand.ink),
        side: const WidgetStatePropertyAll(BorderSide(color: Brand.controlBorder)),
        shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: Radii.mdAll)),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        minimumSize: const WidgetStatePropertyAll(Size(0, 44)),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 12)),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: const WidgetStatePropertyAll(Brand.white),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.action : Brand.controlBorder),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Brand.white,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: Brand.controlBorder,
      modalBarrierColor: Color(0x66111111),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Brand.white,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: Radii.lgAll),
      titleTextStyle: text.titleMedium,
      contentTextStyle: text.bodyMedium?.copyWith(color: Brand.ink70),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Brand.ink,
      contentTextStyle: text.bodySmall?.copyWith(color: Brand.white),
      actionTextColor: Brand.coral,
      shape: RoundedRectangleBorder(borderRadius: Radii.mdAll),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: Brand.action,
      linearTrackColor: Brand.line,
      circularTrackColor: Brand.line,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: Brand.ink70,
      textColor: Brand.ink,
      minVerticalPadding: 10,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      titleTextStyle: text.bodyMedium,
      subtitleTextStyle: text.bodySmall,
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: Brand.action,
      selectionColor: Brand.action.withValues(alpha: 0.25),
      selectionHandleColor: Brand.action,
    ),
  );
}

/// Light status bar and white system navigation bar to match the white app chrome.
const SystemUiOverlayStyle kAppOverlay = SystemUiOverlayStyle(
  statusBarColor: Colors.transparent,
  statusBarIconBrightness: Brightness.dark,
  statusBarBrightness: Brightness.light,
  systemNavigationBarColor: Brand.white,
  systemNavigationBarIconBrightness: Brightness.dark,
  systemNavigationBarDividerColor: Brand.line,
);
