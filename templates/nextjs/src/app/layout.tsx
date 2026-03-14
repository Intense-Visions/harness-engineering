export const metadata = {
  title: 'Harness Engineering App',
  description: 'Built with Harness Engineering practices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
