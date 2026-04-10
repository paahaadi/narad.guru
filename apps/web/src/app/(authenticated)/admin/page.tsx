import { AdminWorkspace } from "@/features/admin/admin-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Pipeline",
};

export default function AdminPage() {
  return <AdminWorkspace />;
}
