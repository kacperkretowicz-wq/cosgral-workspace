(() => {
  let theme = "system";
  try {
    theme = localStorage.getItem("cosgral-theme");
  } catch {}
  document.documentElement.dataset.theme =
    theme === "dark" || theme === "light"
      ? theme
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
})();
