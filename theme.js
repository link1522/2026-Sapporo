const THEME_KEY = "private-itinerary-theme";
const FONT_SIZE_KEY = "private-itinerary-font-size";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let themePreference = "system";
let fontSizePreference = "normal";

try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") themePreference = saved;
  const savedFontSize = localStorage.getItem(FONT_SIZE_KEY);
  if (savedFontSize === "large" || savedFontSize === "larger") fontSizePreference = savedFontSize;
} catch {}

function applyTheme() {
  document.documentElement.dataset.theme = themePreference === "system"
    ? (systemTheme.matches ? "dark" : "light") : themePreference;
  document.querySelector('meta[name="theme-color"]').content =
    document.documentElement.dataset.theme === "dark" ? "#1b2529" : "#ffffff";
}

applyTheme();
document.documentElement.dataset.fontSize = fontSizePreference;
systemTheme.addEventListener("change",() => {
  if (themePreference === "system") applyTheme();
});
document.addEventListener("change",event => {
  if (event.target.name === "font-size" && ["normal","large","larger"].includes(event.target.value)) {
    fontSizePreference = event.target.value;
    document.documentElement.dataset.fontSize = fontSizePreference;
    try {
      if (fontSizePreference === "normal") localStorage.removeItem(FONT_SIZE_KEY);
      else localStorage.setItem(FONT_SIZE_KEY,fontSizePreference);
    } catch {}
    return;
  }
  if (event.target.name !== "theme" || !["system","light","dark"].includes(event.target.value)) return;
  themePreference = event.target.value;
  try {
    if (themePreference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY,themePreference);
  } catch {}
  applyTheme();
});
