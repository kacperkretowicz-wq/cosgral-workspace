(() => {
  // COSGRAL Workspace has one look: the dark Hub style. An older saved choice ("light" or "system") is ignored,
  // and its leftover cache entry is removed.
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
  try {
    localStorage.removeItem("cosgral-theme");
  } catch {}
})();
