import type { Metadata } from "next";
import { DemoProvider } from "@/components/demo-provider";
import { Shell } from "@/components/shell";
import { AccountProvider } from "@/components/account-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: "CallJarvis · A little more peace of mind",
  description:
    "Your proactive personal assistant. Reminders, home activity, and conversations in one place.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DemoProvider>
          <AccountProvider>
            <Shell>{children}</Shell>
          </AccountProvider>
        </DemoProvider>
      </body>
    </html>
  );
}
