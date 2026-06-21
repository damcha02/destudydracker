use std::fs;
use std::path::{Path, PathBuf};

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

  for directory in [".obsidian", "Inbox", "Daily", "References", "Weekly", "Subjects", "Exams", "Summaries", "Templates"] {
    fs::create_dir_all(vault_path.join(directory)).map_err(|error| error.to_string())?;
  }

  let readme = "# Study Tracker Vault\n\nThis vault was created by Study Tracker.\n\nUse Daily for automatic note exports, References for course links, and Subjects/Exams for long-form revision notes.\n";
  fs::write(vault_path.join("README.md"), readme).map_err(|error| error.to_string())?;

  Ok(vault_path.to_string_lossy().to_string())
}

fn daily_note_path(vault_path: &str, note_date: &str) -> PathBuf {
  Path::new(vault_path).join("Daily").join(format!("{}.md", sanitize_segment(note_date)))
}

fn reference_note_path(vault_path: &str, semester_name: &str, course_name: &str) -> Result<PathBuf, String> {
  let semester_name = sanitize_segment(semester_name);
  let course_name = sanitize_segment(course_name);

  if semester_name.is_empty() || course_name.is_empty() {
    return Err("Semester and course are required.".into());
  }

  Ok(Path::new(vault_path).join("References").join(semester_name).join(format!("{}.md", course_name)))
}

#[tauri::command]
fn link_obsidian_vault(vault_path: String) -> Result<String, String> {
  let root = PathBuf::from(&vault_path);
  if !root.exists() {
    return Err("Selected vault folder does not exist.".into());
  }
  if !root.is_dir() {
    return Err("Selected path is not a folder.".into());
  }

  for directory in [".obsidian", "Inbox", "Daily", "References", "Weekly", "Subjects", "Exams", "Summaries", "Templates"] {
    fs::create_dir_all(root.join(directory)).map_err(|error| error.to_string())?;
  }

  Ok(root.to_string_lossy().to_string())
}

#[tauri::command]
fn read_daily_note(vault_path: String, note_date: String) -> Result<Option<String>, String> {
  let note_path = daily_note_path(&vault_path, &note_date);
  if !note_path.exists() {
    return Ok(None);
  }

  fs::read_to_string(note_path).map(Some).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_daily_note(vault_path: String, note_date: String, content: String) -> Result<String, String> {
  let root = PathBuf::from(vault_path);
  let daily_dir = root.join("Daily");
  fs::create_dir_all(&daily_dir).map_err(|error| error.to_string())?;

  let note_path = daily_dir.join(format!("{}.md", sanitize_segment(&note_date)));
  fs::write(&note_path, content).map_err(|error| error.to_string())?;

  Ok(note_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_reference_note(vault_path: String, semester_name: String, course_name: String) -> Result<Option<String>, String> {
  let note_path = reference_note_path(&vault_path, &semester_name, &course_name)?;
  if !note_path.exists() {
    return Ok(None);
  }

  fs::read_to_string(note_path).map(Some).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_reference_note(vault_path: String, semester_name: String, course_name: String, content: String) -> Result<String, String> {
  let note_path = reference_note_path(&vault_path, &semester_name, &course_name)?;
  let reference_dir = note_path.parent().ok_or("Could not resolve reference folder.")?;
  fs::create_dir_all(reference_dir).map_err(|error| error.to_string())?;
  fs::write(&note_path, content).map_err(|error| error.to_string())?;

  Ok(note_path.to_string_lossy().to_string())
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
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![create_obsidian_vault, link_obsidian_vault, read_daily_note, write_daily_note, read_reference_note, write_reference_note, export_daily_note])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
