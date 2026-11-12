import logo from "@/assets/zerox-logo.webp";

/** Premium intro shown on every full page load (reload or new visitor). It is part of the
 *  server HTML so it paints with the first byte, and hides itself by CSS alone (~1s),
 *  so it never waits for scripts. The panel loads underneath at the same time. */
export function ZxSplash() {
  return (
    <div id="zx-splash" aria-hidden="true">
      <div className="zx-sp-emblem">
        <span className="zx-sp-pulse" />
        <span className="zx-sp-ring" />
        <span className="zx-sp-ring2" />
        <img
          className="zx-splash-logo"
          src={logo}
          alt=""
          width={104}
          height={104}
          decoding="sync"
          fetchPriority="high"
        />
      </div>
      <div className="lg">ZEROX</div>
      <div className="sub">BYPASS PANEL</div>
      <div className="bar">
        <i />
      </div>
    </div>
  );
}
