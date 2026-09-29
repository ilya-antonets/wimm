import { type ReactNode } from "react";
import { Toaster } from "react-hot-toast";

import { ImportModal } from "../import/ImportModal";
import { useAppStore } from "../../store/useAppStore";

import { NavBar } from "./NavBar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  const importModalOpen = useAppStore((s) => s.importModalOpen);
  const setImportModalOpen = useAppStore((s) => s.setImportModalOpen);

  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-shell__content">{children}</main>
      <ImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
      <Toaster position="top-right" />
    </div>
  );
}
