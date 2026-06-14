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

export async function pickExistingVaultDirectory() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose an existing Obsidian vault",
  });

  return typeof selected === "string" ? selected : null;
}

export async function createVault(basePath: string, vaultName: string) {
  return invoke<string>("create_obsidian_vault", {
    basePath,
    vaultName,
  });
}

export async function linkVault(vaultPath: string) {
  return invoke<string>("link_obsidian_vault", {
    vaultPath,
  });
}

export async function readDailyNote(vaultPath: string, noteDate: string) {
  return invoke<string | null>("read_daily_note", {
    vaultPath,
    noteDate,
  });
}

export async function writeDailyNote(vaultPath: string, noteDate: string, content: string) {
  return invoke<string>("write_daily_note", {
    vaultPath,
    noteDate,
    content,
  });
}

export async function exportDailyNote(vaultPath: string, noteDate: string, content: string) {
  return invoke<string>("export_daily_note", {
    vaultPath,
    noteDate,
    content,
  });
}
