(() => {
  // Dark is the default look. "system" (chosen by the person) follows the OS; light stays available.
  let theme = "dark";
  try {
    theme = localStorage.getItem("cosgral-theme");
  } catch {}
  document.documentElement.dataset.theme =
    theme === "light"
      ? "light"
      : theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : "dark";
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
})();
