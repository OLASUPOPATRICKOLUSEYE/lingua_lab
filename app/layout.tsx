import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoutLang",
  description:
    "Self-hosted school language learning platform for AI-graded speaking practice and live classroom review.",
};

/*
 * Runs before hydration so a saved "dark" preference never flashes light.
 * Light is now the default; only an explicit "dark" choice adds the class.
 */
const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("lingua-theme")==="dark"){document.documentElement.classList.add("dark")}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT may add the `dark` class
    // before hydration, so the server-rendered class can legitimately differ.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-* attributes on <body> before React hydrates. This suppresses
          the warning one level deep only — it does not mask real hydration
          mismatches in children. */}
      <body className="font-sans min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
