import { useEffect, useState } from "react";

const THEMES = [
  ["fire", "Fire"],
  ["blue", "Blue"],
  ["purple", "Purple"],
] as const;

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<string>("fire");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-zx") || "fire");
  }, []);

  function pick(t: string) {
    setTheme(t);
    document.documentElement.setAttribute("data-zx", t);
    try {
      localStorage.setItem("zx_theme", t);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="zx-themes" role="group" aria-label="Theme">
      {THEMES.map(([id, label]) => (
        <button
          key={id}
          type="button"
          data-t={id}
          title={label}
          aria-pressed={theme === id}
          className={theme === id ? "on" : ""}
          onClick={() => pick(id)}
        >
          <i className="dot" />
          <span className="lb">{label}</span>
        </button>
      ))}
    </div>
  );
}
