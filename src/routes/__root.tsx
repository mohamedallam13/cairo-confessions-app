import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import Layout from "../components/Layout";
import { LOGO_BASE64 } from "../assets/logoBase64";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
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
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Cairo Confessions" },
      { name: "theme-color", content: "#050606" },
      { title: "Cairo Confessions — Egypt's anonymous platform" },
      { name: "description", content: "An anonymous online platform where Cairenes share what they can't say out loud. Confess, contact a confessor, track your confession, find a listener." },
      { property: "og:title", content: "Cairo Confessions" },
      { property: "og:description", content: "Egypt's first anonymous confession platform. Always anonymous." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Barlow:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Cairo:wght@400;600;700&display=swap" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icons/icon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192x192.png" },
      { rel: "apple-touch-icon", href: "/icons/icon-180x180.png" },
      { rel: "apple-touch-icon", sizes: "167x167", href: "/icons/icon-167x167.png" },
      { rel: "apple-touch-icon", sizes: "152x152", href: "/icons/icon-152x152.png" },
      // Apple startup images — iOS uses these as the launch screen before WebView loads
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)", href: "/splash/splash-430-932@3x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 2)", href: "/splash/splash-430-932@2x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)", href: "/splash/splash-393-852@3x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 2)", href: "/splash/splash-393-852@2x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)", href: "/splash/splash-390-844@3x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 2)", href: "/splash/splash-390-844@2x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)", href: "/splash/splash-375-812@3x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 2)", href: "/splash/splash-375-812@2x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)", href: "/splash/splash-414-896@3x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)", href: "/splash/splash-414-896@2x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)", href: "/splash/splash-375-667@2x.png" },
      { rel: "apple-touch-startup-image", media: "screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)", href: "/splash/splash-320-568@2x.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: "#050606" }}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          html,body{background:#050606;margin:0}
          @keyframes _cc_logo_in{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
          @keyframes _cc_text_in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
          #pwa-splash-logo{animation:_cc_logo_in .5s cubic-bezier(.16,1,.3,1) forwards}
          #pwa-splash-text{animation:_cc_text_in .5s .15s cubic-bezier(.16,1,.3,1) both}
        `}} />
        <HeadContent />
      </head>
      <body>
        {/* Splash is in SSR HTML — visible on first paint, no React needed to show it.
            Logo is base64 so there's zero network request. CSS animates it in.
            Inline script instantly removes it for non-PWA. */}
        <div id="pwa-splash" style={{ position:"fixed", inset:0, zIndex:9999, background:"#050606", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24, transition:"opacity .6s ease" }}>
          <img id="pwa-splash-logo" src={LOGO_BASE64} alt="" style={{ width:80, height:80, objectFit:"contain", opacity:0 }} />
          <p id="pwa-splash-text" style={{ fontFamily:"sans-serif", fontSize:11, letterSpacing:"0.35em", textTransform:"uppercase", color:"rgba(242,242,242,0.3)", margin:0, opacity:0 }}>Cairo Confessions</p>
        </div>
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){var p=window.matchMedia('(display-mode:standalone)').matches||navigator.standalone;` +
          `if(!p){var e=document.getElementById('pwa-splash');if(e)e.style.display='none';}})();`
        }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Layout />
    </QueryClientProvider>
  );
}
