export const COLORS = {
  primary: "#E91E90",
  primaryLight: "#FF6EB4",
  primaryDark: "#C2185B",
  primaryBg: "#FFF0F5",

  secondary: "#FFD700",

  background: "#FFFFFF",
  surface: "#F8F8F8",
  card: "#FFFFFF",

  text: "#2D2D2D",
  textSecondary: "#666666",
  textLight: "#999999",
  textOnPrimary: "#FFFFFF",

  border: "#EEEEEE",
  divider: "#F0F0F0",

  success: "#4CAF50",
  error: "#F44336",
  warning: "#FF9800",

  heart: "#FF1744",
  star: "#FFC107",
};

export const FONTS = {
  regular: { fontSize: 14, color: COLORS.text },
  medium: { fontSize: 16, color: COLORS.text, fontWeight: "500" },
  bold: { fontSize: 16, color: COLORS.text, fontWeight: "700" },
  title: { fontSize: 24, color: COLORS.text, fontWeight: "700" },
  subtitle: { fontSize: 18, color: COLORS.text, fontWeight: "600" },
  caption: { fontSize: 12, color: COLORS.textSecondary },
};

export const SHADOWS = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
