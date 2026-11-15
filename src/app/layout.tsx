import type { Metadata } from "next";
import { DemoProvider } from "@/components/demo-provider";
import { Shell } from "@/components/shell";
import { AccountProvider } from "@/components/account-provider";
import "./globals.css";
import "./theme.css";
export const metadata: Metadata = {
  title: "Sir Jarvis · A celestial navigator",
  description:
    "A celestial navigator for your everyday odyssey. Simple reminders and a personal assistant you can call.",
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
