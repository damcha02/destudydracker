use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const LATEST_UPDATE_JSON_URL: &str =
    "https://github.com/damcha02/destudydracker/releases/latest/download/latest.json";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInstallSupport {
    can_auto_install: bool,
    package_hint: String,
    runtime_channel: String,
    message: String,
}

#[derive(serde::Deserialize)]
struct LatestUpdateJson {
    version: String,
    platforms: HashMap<String, UpdatePlatform>,
}

#[derive(serde::Deserialize)]
struct UpdatePlatform {
    url: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LinuxUpdateDownload {
    version: String,
    package_type: String,
    file_path: String,
    install_command: String,
    message: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryFile {
    name: String,
    path: String,
    extension: String,
    kind: String,
    size_bytes: u64,
}

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

    for directory in [".obsidian", "Daily", "References", "Summaries"] {
        fs::create_dir_all(vault_path.join(directory)).map_err(|error| error.to_string())?;
    }

    let readme = "# Study Tracker Vault\n\nThis vault was created by Study Tracker.\n\nUse Daily for session notes, References for course links, and Summaries for PDFs, formula sheets, and cheatsheet images.\n";
    fs::write(vault_path.join("README.md"), readme).map_err(|error| error.to_string())?;

    Ok(vault_path.to_string_lossy().to_string())
}

fn daily_note_path(vault_path: &str, note_date: &str) -> PathBuf {
    Path::new(vault_path)
        .join("Daily")
        .join(format!("{}.md", sanitize_segment(note_date)))
}

fn reference_note_path(
    vault_path: &str,
    semester_name: &str,
    course_name: &str,
) -> Result<PathBuf, String> {
    let semester_name = sanitize_segment(semester_name);
    let course_name = sanitize_segment(course_name);

    if semester_name.is_empty() || course_name.is_empty() {
        return Err("Semester and course are required.".into());
    }

    Ok(Path::new(vault_path)
        .join("References")
        .join(semester_name)
        .join(format!("{}.md", course_name)))
}

fn summaries_dir_path(
    vault_path: &str,
    semester_name: &str,
    course_name: &str,
) -> Result<PathBuf, String> {
    let semester_name = sanitize_segment(semester_name);
    let course_name = sanitize_segment(course_name);

    if semester_name.is_empty() || course_name.is_empty() {
        return Err("Semester and course are required.".into());
    }

    Ok(Path::new(vault_path)
        .join("Summaries")
        .join(semester_name)
        .join(course_name))
}

fn supported_summary_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "pdf" | "png" | "jpg" | "jpeg" | "webp" => Some(extension),
        _ => None,
    }
}

fn summary_file_kind(extension: &str) -> String {
    if extension == "pdf" {
        "pdf".into()
    } else {
        "image".into()
    }
}

fn unique_summary_destination(directory: &Path, file_name: &str) -> PathBuf {
    let original = Path::new(file_name);
    let stem = original
        .file_stem()
        .map(|value| sanitize_segment(&value.to_string_lossy()))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "summary".into());
    let extension = original
        .extension()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty());

    let mut candidate = directory.join(file_name);
    let mut index = 2;
    while candidate.exists() {
        let next_name = match &extension {
            Some(extension) => format!("{}-{}.{}", stem, index, extension),
            None => format!("{}-{}", stem, index),
        };
        candidate = directory.join(next_name);
        index += 1;
    }

    candidate
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

    for directory in [".obsidian", "Daily", "References", "Summaries"] {
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

    fs::read_to_string(note_path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn write_daily_note(
    vault_path: String,
    note_date: String,
    content: String,
) -> Result<String, String> {
    let root = PathBuf::from(vault_path);
    let daily_dir = root.join("Daily");
    fs::create_dir_all(&daily_dir).map_err(|error| error.to_string())?;

    let note_path = daily_dir.join(format!("{}.md", sanitize_segment(&note_date)));
    fs::write(&note_path, content).map_err(|error| error.to_string())?;

    Ok(note_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_reference_note(
    vault_path: String,
    semester_name: String,
    course_name: String,
) -> Result<Option<String>, String> {
    let note_path = reference_note_path(&vault_path, &semester_name, &course_name)?;
    if !note_path.exists() {
        return Ok(None);
    }

    fs::read_to_string(note_path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn write_reference_note(
    vault_path: String,
    semester_name: String,
    course_name: String,
    content: String,
) -> Result<String, String> {
    let note_path = reference_note_path(&vault_path, &semester_name, &course_name)?;
    let reference_dir = note_path
        .parent()
        .ok_or("Could not resolve reference folder.")?;
    fs::create_dir_all(reference_dir).map_err(|error| error.to_string())?;
    fs::write(&note_path, content).map_err(|error| error.to_string())?;

    Ok(note_path.to_string_lossy().to_string())
}

#[tauri::command]
fn list_summary_files(
    vault_path: String,
    semester_name: String,
    course_name: String,
) -> Result<Vec<SummaryFile>, String> {
    let summaries_dir = summaries_dir_path(&vault_path, &semester_name, &course_name)?;
    if !summaries_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(&summaries_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(extension) = supported_summary_extension(&path) else {
            continue;
        };
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "summary".into());

        files.push(SummaryFile {
            name,
            path: path.to_string_lossy().to_string(),
            kind: summary_file_kind(&extension),
            extension,
            size_bytes: metadata.len(),
        });
    }

    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

#[tauri::command]
fn import_summary_files(
    vault_path: String,
    semester_name: String,
    course_name: String,
    file_paths: Vec<String>,
) -> Result<Vec<SummaryFile>, String> {
    let summaries_dir = summaries_dir_path(&vault_path, &semester_name, &course_name)?;
    fs::create_dir_all(&summaries_dir).map_err(|error| error.to_string())?;

    for source in file_paths {
        let source_path = PathBuf::from(&source);
        if !source_path.is_file() {
            return Err(format!("{} is not a file.", source));
        }
        if supported_summary_extension(&source_path).is_none() {
            return Err("Only PDF, PNG, JPG, JPEG, and WEBP files can be added to summaries.".into());
        }

        let file_name = source_path
            .file_name()
            .map(|value| sanitize_segment(&value.to_string_lossy()))
            .filter(|value| !value.is_empty())
            .ok_or("Could not read the selected file name.")?;
        let destination = unique_summary_destination(&summaries_dir, &file_name);
        fs::copy(&source_path, &destination).map_err(|error| error.to_string())?;
    }

    list_summary_files(vault_path, semester_name, course_name)
}

#[tauri::command]
fn read_summary_pdf(path: String) -> Result<Vec<u8>, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err("Selected summary file does not exist.".into());
    }
    if file_path
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .as_deref()
        != Some("pdf")
    {
        return Err("Only PDF summary files can be opened in the PDF viewer.".into());
    }

    fs::read(file_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn export_daily_note(
    vault_path: String,
    note_date: String,
    content: String,
) -> Result<String, String> {
    let root = PathBuf::from(vault_path);
    let daily_dir = root.join("Daily");
    fs::create_dir_all(&daily_dir).map_err(|error| error.to_string())?;

    let file_name = format!("{}.md", sanitize_segment(&note_date));
    let note_path = daily_dir.join(file_name);
    fs::write(&note_path, content).map_err(|error| error.to_string())?;

    Ok(note_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_update_install_support() -> UpdateInstallSupport {
    let runtime_channel = runtime_channel();
    if runtime_channel == "development" {
        return UpdateInstallSupport {
            can_auto_install: false,
            package_hint: "development".into(),
            runtime_channel,
            message: "Updates are disabled in development builds. Update with: git pull, npm install, then npm run tauri:dev.".into(),
        };
    }

    if runtime_channel != "official-release" {
        return UpdateInstallSupport {
            can_auto_install: false,
            package_hint: "source-build".into(),
            runtime_channel,
            message: "Updates are disabled for source builds. Update by pulling the repository and rebuilding from source.".into(),
        };
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        return UpdateInstallSupport {
            can_auto_install: true,
            package_hint: "native".into(),
            runtime_channel,
            message: "Automatic updates are supported for this install.".into(),
        };
    }

    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("APPIMAGE").is_some() {
            return UpdateInstallSupport {
                can_auto_install: true,
                package_hint: "appimage".into(),
                runtime_channel,
                message: "Automatic updates are supported for this AppImage install.".into(),
            };
        }

        if linux_distribution_family() == "source" {
            return UpdateInstallSupport {
                can_auto_install: false,
                package_hint: "source-linux".into(),
                runtime_channel,
                message: "A new version is available. For Arch, Hyprland-heavy setups, and unsupported Linux distributions, update by pulling the repository and rebuilding from source.".into(),
            };
        }

        return UpdateInstallSupport {
            can_auto_install: false,
            package_hint: "manual-linux".into(),
            runtime_channel,
            message: "Automatic installation is disabled for Linux .deb and .rpm installs. Download the matching package, then run the install command shown by the app.".into(),
        };
    }

    #[allow(unreachable_code)]
    UpdateInstallSupport {
        can_auto_install: false,
        package_hint: "unsupported".into(),
        runtime_channel,
        message: "Automatic installation is not supported on this platform.".into(),
    }
}

fn runtime_channel() -> String {
    if cfg!(debug_assertions) {
        return "development".into();
    }

    if option_env!("STUDY_TRACKER_OFFICIAL_RELEASE") == Some("1") {
        return "official-release".into();
    }

    "source-build".into()
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(target_os = "linux")]
fn linux_distribution_family() -> String {
    let os_release = fs::read_to_string("/etc/os-release")
        .unwrap_or_default()
        .to_lowercase();

    if os_release.contains("debian")
        || os_release.contains("ubuntu")
        || os_release.contains("linuxmint")
        || os_release.contains("pop")
    {
        return "deb".into();
    }

    if os_release.contains("fedora")
        || os_release.contains("rhel")
        || os_release.contains("centos")
        || os_release.contains("opensuse")
        || os_release.contains("suse")
    {
        return "rpm".into();
    }

    "source".into()
}

fn file_name_from_url(url: &str) -> Result<String, String> {
    url.rsplit('/')
        .next()
        .filter(|file_name| !file_name.trim().is_empty())
        .map(|file_name| file_name.to_string())
        .ok_or("Could not determine update file name.".into())
}

#[tauri::command]
async fn download_linux_update_package() -> Result<LinuxUpdateDownload, String> {
    #[cfg(not(target_os = "linux"))]
    {
        return Err("Manual package downloads are only available on Linux.".into());
    }

    #[cfg(target_os = "linux")]
    {
        let latest = reqwest::get(LATEST_UPDATE_JSON_URL)
            .await
            .map_err(|error| format!("Could not fetch update metadata: {error}"))?
            .error_for_status()
            .map_err(|error| format!("GitHub returned an update metadata error: {error}"))?
            .json::<LatestUpdateJson>()
            .await
            .map_err(|error| format!("Could not parse update metadata: {error}"))?;

        let family = linux_distribution_family();
        if family == "source" {
            return Err("For Arch, Hyprland-heavy setups, and unsupported Linux distributions, update by running: git pull && npm install && npm run tauri:build".into());
        }

        let platform_key = match family.as_str() {
            "deb" => "linux-x86_64-deb",
            "rpm" => "linux-x86_64-rpm",
            _ => "linux-x86_64-deb",
        };

        let platform = latest
            .platforms
            .get(platform_key)
            .or_else(|| latest.platforms.get("linux-x86_64"))
            .ok_or("No Linux update package was found in the latest release.".to_string())?;

        let file_name = file_name_from_url(&platform.url)?;
        let home = std::env::var("HOME")
            .map_err(|_| "Could not determine your home folder.".to_string())?;
        let downloads_dir = PathBuf::from(home).join("Downloads");
        fs::create_dir_all(&downloads_dir)
            .map_err(|error| format!("Could not create Downloads folder: {error}"))?;
        let file_path = downloads_dir.join(file_name);

        let bytes = reqwest::get(&platform.url)
            .await
            .map_err(|error| format!("Could not download update package: {error}"))?
            .error_for_status()
            .map_err(|error| format!("GitHub returned a download error: {error}"))?
            .bytes()
            .await
            .map_err(|error| format!("Could not read update package download: {error}"))?;

        fs::write(&file_path, &bytes)
            .map_err(|error| format!("Could not save update package: {error}"))?;

        let file_path_string = file_path.to_string_lossy().to_string();
        let quoted_path = shell_quote(&file_path_string);
        let install_command = match family.as_str() {
            "deb" => format!("sudo apt install {quoted_path}"),
            "rpm" => {
                let os_release = fs::read_to_string("/etc/os-release")
                    .unwrap_or_default()
                    .to_lowercase();
                if os_release.contains("opensuse") || os_release.contains("suse") {
                    format!("sudo zypper install {quoted_path}")
                } else {
                    format!("sudo dnf install {quoted_path}")
                }
            }
            _ => format!("sudo apt install {quoted_path}"),
        };

        let message = match family.as_str() {
            "deb" => "Downloaded the Debian/Ubuntu package. Run the command below to install it.",
            "rpm" => "Downloaded the RPM package. Run the command below to install it.",
            _ => "Downloaded the Linux package. Run the command below to install it.",
        };

        Ok(LinuxUpdateDownload {
            version: latest.version,
            package_type: family,
            file_path: file_path_string,
            install_command,
            message: message.into(),
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            create_obsidian_vault,
            link_obsidian_vault,
            read_daily_note,
            write_daily_note,
            read_reference_note,
            write_reference_note,
            list_summary_files,
            import_summary_files,
            read_summary_pdf,
            export_daily_note,
            get_update_install_support,
            download_linux_update_package
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
