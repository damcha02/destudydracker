import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export function isTauriApp() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickVaultParentDirectory() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose where the new Obsidian vault should live",
  });

  return typeof selected === "string" ? selected : null;
}

export async function createVault(basePath: string, vaultName: string) {
  return invoke<string>("create_obsidian_vault", {
    basePath,
    vaultName,
  });
}

export async function exportDailyNote(vaultPath: string, noteDate: string, content: string) {
  return invoke<string>("export_daily_note", {
    vaultPath,
    noteDate,
    content,
  });
}
