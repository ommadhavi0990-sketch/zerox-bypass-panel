import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import iconsCss from "bootstrap-icons/font/bootstrap-icons.min.css?url";
import { ZxBackground, ZxBackgroundLayers } from "@/components/zx/Background";
import { ThemeSwitcher } from "@/components/zx/ThemeSwitcher";
import { ZxSplash } from "@/components/zx/Splash";

// Runs before first paint: restore the saved theme (no flash of the wrong colours).
const BOOT_SCRIPT = `(function(){var d=document.documentElement,t="fire";try{t=(localStorage.getItem("zx_theme")||"fire").replace("red","fire")}catch(e){}d.setAttribute("data-zx",t)})()`;
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@500;600;700&display=swap";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="zx-card max-w-md p-8 text-center">
        <h1 className="zx-logo text-7xl">404</h1>
        <h2 className="mt-4 text-xl">Page not found</h2>
        <p className="mt-2 text-sm zx-muted">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-6">
          <Link to="/" className="zx-btn">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="zx-card max-w-md p-8 text-center">
        <h1 className="text-xl">This page didn't load</h1>
        <p className="mt-2 text-sm zx-muted">Something went wrong. You can try again or head back home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="zx-btn">Try again</button>
          <a href="/" className="zx-btn-ghost">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a0201" },
      { title: "ZEROX BYPASS Panel" },
      { name: "description", content: "ZEROX BYPASS key & referral management panel." },
      { name: "author", content: "ZEROX BYPASS" },
      { property: "og:title", content: "ZEROX BYPASS Panel" },
      { property: "og:description", content: "ZEROX BYPASS key & referral management panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS_URL },
      { rel: "stylesheet", href: iconsCss },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-zx="fire" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <ZxBackgroundLayers />
        <ZxSplash />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function TopBar() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  return pending ? <div className="zx-topbar" /> : null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  return (
    <QueryClientProvider client={queryClient}>
      <ZxBackground />
      <TopBar />
      <ThemeSwitcher />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster theme="dark" position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)", fontWeight: 600 } }} />
    </QueryClientProvider>
  );
}
