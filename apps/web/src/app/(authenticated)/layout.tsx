import { AppShell } from "@/components/shell/app-shell";
import { getServerPrincipal } from "@/lib/server-session";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerPrincipal();

  return <AppShell session={session}>{children}</AppShell>;
}
