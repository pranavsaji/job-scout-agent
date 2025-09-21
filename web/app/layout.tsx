import Providers from "./providers";

export const metadata = { title: "Job Scout" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "linear-gradient(180deg,#fafafa,white)" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
