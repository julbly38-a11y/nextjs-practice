// Кольорова схема per-лікарня — 1:1 порт lib/hospital-themes.js та
// public/shared/theme.css з hospital-analytics. Хотин (edrpou 02005875) не
// має власного запису — він і є дефолт (DEFAULT_HOSPITAL_THEME, узятий
// напряму з theme.css); якщо для лікарні немає окремого запису в
// HOSPITAL_THEME_OVERRIDES, застосовується той самий дефолт Хотина.
export interface HospitalTheme {
  ink1: string;
  ink2: string;
  ink3: string;
  ink4: string;
  sage: string;
  taupe: string;
  taupeLight: string;
  accentBerry: string;
  accentPink: string;
  accentRed: string;
  cream: string;
  white: string;
  black: string;
  mesh: string[]; // 5 кольорів для анімованого mesh-фону
}

export const DEFAULT_HOSPITAL_THEME: HospitalTheme = {
  ink1: "#1a1a1a",
  ink2: "#2a2a2a",
  ink3: "#3a3a3a",
  ink4: "#4a4a4a",
  sage: "#5f6e5e",
  taupe: "#8a857f",
  taupeLight: "#9a958f",
  accentBerry: "#9c5468",
  accentPink: "#b27c8b",
  accentRed: "#c0392b",
  cream: "#f0ece8",
  white: "#ffffff",
  black: "#000000",
  mesh: ["#d69696", "#96beb4", "#c8b4d2", "#b4c8cd", "#e6c8b9"],
};

const HOSPITAL_THEME_OVERRIDES: Record<string, Partial<HospitalTheme>> = {
  // ЛШМД (Лікарня швидкої мед. допомоги), edrpou 43342788 — з логотипу:
  // #9cb1d8 (світліший синій) і #4e73b9 (темніший синій), решта підібрана
  // під той самий холодний тон.
  "43342788": {
    ink1: "#191b1f",
    ink2: "#282b30",
    ink3: "#383c42",
    ink4: "#484d54",
    sage: "#5f7690",
    taupe: "#82898f",
    taupeLight: "#9aa0a8",
    accentBerry: "#4e73b9",
    accentPink: "#9cb1d8",
    cream: "#eef1f5",
    mesh: [
      "rgba(156,177,216,0.50)",
      "rgba(78,115,185,0.35)",
      "rgba(180,190,215,0.35)",
      "rgba(160,195,205,0.30)",
      "rgba(200,208,225,0.40)",
    ],
  },
};

export function getHospitalTheme(edrpou: string | null | undefined): HospitalTheme {
  const override = edrpou ? HOSPITAL_THEME_OVERRIDES[edrpou] : null;
  return override ? { ...DEFAULT_HOSPITAL_THEME, ...override } : DEFAULT_HOSPITAL_THEME;
}
