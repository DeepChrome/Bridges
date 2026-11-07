/* The two palettes, shared by the phone (native/src/theme.js) and the desktop
 * (desktop/src/renderer/theme.js), so one colour cannot drift between them.
 * tools/contrast.js reads this file: every foreground clears its minimum
 * against the surface it sits on, and the frozen web app's CSS carries the
 * same values. Change a value here, run the audit, and solve for the value
 * rather than nudging it (§31).
 *
 * The exercise book (2026-10-01): ink on plain paper in the light, and at
 * night an ink-dark blue with chalk-white text and a lamp-gold accent. */

export const light = {
  bg: "#F5F5F2", surface: "#FFFFFF", surface2: "#ECECE8", surface3: "#DCDCD6",
  /* On the paper's own hue (60°): the inks the skin had were faintly blue,
     and a page whose text and ground sit on different undertones looks
     slightly off without anyone saying why (tools/contrast.js, §31). */
  ink: "#1D1D1A", ink2: "#45453F", ink3: "#60605A",
  line: "#CFCFC9", lineSoft: "#E6E6E1",
  brand: "#233A8B", brandInk: "#1E327B", brandBg: "#E6EAF5", brandDim: "#18296A",
  good: "#2B7A4C", goodBg: "#E2F1E7", goodDim: "#21623C",
  bad: "#C42B3B", badBg: "#FAE5E7", badDim: "#A11F2E",
  info: "#2F5F9A", infoBg: "#E4ECF6",
  /* The middle of the familiarity ring's red → amber → green (2026-09-23).
     A stroke, never text; audited at the accent minimum against the page. */
  warn: "#986809",
  brandOn: "#FFFFFF", goodOn: "#FFFFFF", badOn: "#FFFFFF",
  pen: "#C42B3B",        // the teacher's red pen: the mark out of five
};

export const dark = {
  bg: "#12151D", surface: "#1A1E28", surface2: "#232835", surface3: "#2E3443",
  ink: "#F0F1F4", ink2: "#C8CBD4", ink3: "#A2A7B5",
  line: "#363C4C", lineSoft: "#262B37",
  brand: "#F2C14E", brandInk: "#F5CD6B", brandBg: "#2D291D", brandDim: "#C89A2E",
  good: "#7FD3A0", goodBg: "#17302A", goodDim: "#5FB585",
  bad: "#F28B96", badBg: "#3A1F25", badDim: "#D46E79",
  info: "#8DB8EE", infoBg: "#1C2A40",
  warn: "#E8B44A",
  brandOn: "#12151D", goodOn: "#12151D", badOn: "#12151D",
  pen: "#F28B96",
};

export const palette = (scheme) => (scheme === "dark" ? dark : light);
