import { AppSidebar } from "@/components/navigation/app-sidebar";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <AppSidebar active="settings" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div>
              <div className="text-xl font-bold">Settings</div>
              <div className="text-sm text-slate-500">
                App configuration will live here.
              </div>
            </div>
          </header>

          <div className="flex-1 p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="mt-2 text-slate-600">
                This page is intentionally blank for now.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
