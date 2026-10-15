const THEME_KEY = "private-itinerary-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let themePreference = "system";

try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") themePreference = saved;
} catch {}

function applyTheme() {
  document.documentElement.dataset.theme = themePreference === "system"
    ? (systemTheme.matches ? "dark" : "light") : themePreference;
  document.querySelector('meta[name="theme-color"]').content =
    document.documentElement.dataset.theme === "dark" ? "#1b2529" : "#ffffff";
}

applyTheme();
systemTheme.addEventListener("change",() => {
  if (themePreference === "system") applyTheme();
});
document.addEventListener("change",event => {
  if (event.target.name !== "theme" || !["system","light","dark"].includes(event.target.value)) return;
  themePreference = event.target.value;
  try {
    if (themePreference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY,themePreference);
  } catch {}
  applyTheme();
});
