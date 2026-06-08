use std::fs;
use std::path::PathBuf;

fn sanitize_segment(value: &str) -> String {
  value
    .chars()
    .map(|character| match character {
      '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
      _ => character,
    })
    .collect::<String>()
    .trim()
    .to_string()
}

#[tauri::command]
fn create_obsidian_vault(base_path: String, vault_name: String) -> Result<String, String> {
  let vault_name = sanitize_segment(&vault_name);
  if vault_name.is_empty() {
    return Err("Vault name cannot be empty.".into());
  }

  let vault_path = PathBuf::from(base_path).join(vault_name);
  fs::create_dir_all(&vault_path).map_err(|error| error.to_string())?;

  for directory in ["Inbox", "Daily", "Weekly", "Subjects", "Exams", "Summaries", "Templates"] {
    fs::create_dir_all(vault_path.join(directory)).map_err(|error| error.to_string())?;
  }

  let readme = "# Study Tracker Vault\n\nThis vault was created by Study Tracker.\n\nUse Daily for automatic note exports and Subjects/Exams for long-form revision notes.\n";
  fs::write(vault_path.join("README.md"), readme).map_err(|error| error.to_string())?;

  Ok(vault_path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_daily_note(vault_path: String, note_date: String, content: String) -> Result<String, String> {
  let root = PathBuf::from(vault_path);
  let daily_dir = root.join("Daily");
  fs::create_dir_all(&daily_dir).map_err(|error| error.to_string())?;

  let file_name = format!("{}.md", sanitize_segment(&note_date));
  let note_path = daily_dir.join(file_name);
  fs::write(&note_path, content).map_err(|error| error.to_string())?;

  Ok(note_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![create_obsidian_vault, export_daily_note])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
