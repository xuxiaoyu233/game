use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

pub const MAX_SAVE_BYTES: u64 = 8 * 1024 * 1024;
const MAIN_FILE: &str = "save.json";
const BACKUP_FILE: &str = "save.backup.json";

pub struct SaveRepository {
    directory: PathBuf,
    gate: Mutex<()>,
}

impl SaveRepository {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            gate: Mutex::new(()),
        }
    }

    pub fn read(&self, backup: bool) -> io::Result<Option<String>> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("save lock is unavailable"))?;
        read_optional(
            &self
                .directory
                .join(if backup { BACKUP_FILE } else { MAIN_FILE }),
        )
    }

    pub fn write(&self, contents: &str, preserve_backup: bool) -> io::Result<()> {
        self.write_with(contents, preserve_backup, replace_file)
    }

    fn write_with(
        &self,
        contents: &str,
        preserve_backup: bool,
        mut replace: impl FnMut(&Path, &Path) -> io::Result<()>,
    ) -> io::Result<()> {
        // Validate before creating directories or touching any existing save.
        validate_json(contents)?;
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("save lock is unavailable"))?;
        fs::create_dir_all(&self.directory)?;
        // Windows package virtualization can redirect C:\\...\\AppData to another
        // volume while MoveFileExW still receives the logical C: path. Resolve
        // the existing directory once so every write and rename uses the same
        // physical parent, including a destination that does not exist yet.
        let directory = fs::canonicalize(&self.directory)?;
        let main_path = directory.join(MAIN_FILE);
        let backup_path = directory.join(BACKUP_FILE);
        let main_temp = directory.join("save.tmp.json");
        let backup_temp = directory.join("save.backup.tmp.json");

        write_verified(&main_temp, contents)?;

        // A corrupt main must never replace an existing valid recovery copy.
        // Schema validation stays in TypeScript; native checks JSON syntax only.
        let previous = if preserve_backup {
            None
        } else {
            match read_optional(&main_path) {
                Ok(Some(previous)) if validate_json(&previous).is_ok() => Some(previous),
                Ok(_) => None,
                Err(error) if error.kind() == io::ErrorKind::InvalidData => None,
                Err(error) => return Err(error),
            }
        };
        if let Some(previous) = previous {
            write_verified(&backup_temp, &previous)?;
            replace(&backup_temp, &backup_path)?;
        }

        // The existing main is never deleted first. Temps and destinations share
        // their resolved physical parent; a denied replacement reaches the
        // caller and leaves the existing main intact.
        replace(&main_temp, &main_path)
    }
}

pub fn validate_json(contents: &str) -> io::Result<()> {
    if contents.len() as u64 > MAX_SAVE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "save exceeds the 8 MiB limit",
        ));
    }
    serde_json::from_str::<serde_json::Value>(contents)
        .map(|_| ())
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

pub fn read_optional(path: &Path) -> io::Result<Option<String>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut contents = String::new();
    file.take(MAX_SAVE_BYTES + 1)
        .read_to_string(&mut contents)?;
    if contents.len() as u64 > MAX_SAVE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "save exceeds the 8 MiB limit",
        ));
    }
    Ok(Some(contents))
}

fn write_verified(path: &Path, contents: &str) -> io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(contents.as_bytes())?;
    file.sync_all()?;
    drop(file);
    let written = read_optional(path)?
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "temporary save disappeared"))?;
    validate_json(&written)?;
    if written != contents {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "temporary save verification failed",
        ));
    }
    Ok(())
}

/// Write only a path returned by the Rust native save dialog. No path is
/// accepted from the renderer. Use a sibling temp to preserve an existing file
/// if writing or verification fails; exported files do not enter game storage.
pub fn export_json(path: &Path, contents: &str) -> io::Result<()> {
    validate_json(contents)?;
    let directory = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing export directory"))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing export file name"))?;
    let directory = fs::canonicalize(directory)?;
    let destination = directory.join(file_name);
    // create_new prevents collisions with unrelated files in the selected folder.
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_nanos();
    let temporary = directory.join(format!(
        ".zhujie-rescue-bureau-export-{}-{nonce}.tmp",
        std::process::id()
    ));
    let mut file = File::options()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| {
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        drop(file);
        let written = read_optional(&temporary)?
            .ok_or_else(|| io::Error::other("temporary export disappeared"))?;
        validate_json(&written)?;
        if written != contents {
            return Err(io::Error::other("temporary export verification failed"));
        }
        replace_file(&temporary, &destination)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: the UTF-16 buffers remain alive and are NUL-terminated. Flags
    // deliberately omit COPY_ALLOWED: the sibling replacement stays on-volume.
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIRST: &str = r#"{"version":1,"coins":7}"#;
    const SECOND: &str = r#"{"version":1,"coins":12}"#;

    #[test]
    fn writes_use_one_resolved_parent_for_new_main_and_backup_replacement() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("indirection")).unwrap();
        let logical = root.path().join("indirection").join("..").join("saves");
        let repository = SaveRepository::new(logical);
        let physical = root.path().join("saves");
        let mut replacement_count = 0;
        let mut resolved_replace = |source: &Path, destination: &Path| {
            let expected = fs::canonicalize(&physical).unwrap();
            assert_eq!(source.parent(), Some(expected.as_path()));
            assert_eq!(destination.parent(), Some(expected.as_path()));
            replacement_count += 1;
            replace_file(source, destination)
        };

        repository
            .write_with(FIRST, false, &mut resolved_replace)
            .unwrap();
        repository
            .write_with(SECOND, false, &mut resolved_replace)
            .unwrap();

        assert_eq!(replacement_count, 3);
        assert_eq!(repository.read(false).unwrap().as_deref(), Some(SECOND));
        assert_eq!(repository.read(true).unwrap().as_deref(), Some(FIRST));
    }

    #[test]
    fn export_replaces_only_the_selected_file_in_its_resolved_directory() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("indirection")).unwrap();
        let selected = root
            .path()
            .join("indirection")
            .join("..")
            .join("selected.json");
        let unrelated = root.path().join("unrelated.json");
        fs::write(&selected, FIRST).unwrap();
        fs::write(&unrelated, FIRST).unwrap();

        export_json(&selected, SECOND).unwrap();

        assert_eq!(read_optional(&selected).unwrap().as_deref(), Some(SECOND));
        assert_eq!(read_optional(&unrelated).unwrap().as_deref(), Some(FIRST));
    }

    #[test]
    fn failed_main_replacement_preserves_previous_main_and_backup() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SaveRepository::new(directory.path().to_path_buf());
        repository.write(FIRST, false).unwrap();

        let result = repository.write_with(SECOND, false, |source, destination| {
            if destination.file_name().unwrap() == MAIN_FILE {
                Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "simulated lock",
                ))
            } else {
                replace_file(source, destination)
            }
        });

        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(repository.read(false).unwrap().as_deref(), Some(FIRST));
        assert_eq!(repository.read(true).unwrap().as_deref(), Some(FIRST));
    }

    #[test]
    fn failed_backup_replacement_does_not_touch_main_or_existing_backup() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SaveRepository::new(directory.path().to_path_buf());
        repository.write(FIRST, false).unwrap();
        repository.write(SECOND, false).unwrap();

        let result = repository.write_with(r#"{"coins":50}"#, false, |_, _| {
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "simulated backup lock",
            ))
        });

        assert!(result.is_err());
        assert_eq!(repository.read(false).unwrap().as_deref(), Some(SECOND));
        assert_eq!(repository.read(true).unwrap().as_deref(), Some(FIRST));
    }

    #[test]
    fn corrupt_main_is_not_copied_over_valid_backup() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SaveRepository::new(directory.path().to_path_buf());
        repository.write(FIRST, false).unwrap();
        repository.write(SECOND, false).unwrap();
        fs::write(directory.path().join(MAIN_FILE), "broken JSON").unwrap();

        repository.write(SECOND, false).unwrap();

        assert_eq!(repository.read(false).unwrap().as_deref(), Some(SECOND));
        assert_eq!(repository.read(true).unwrap().as_deref(), Some(FIRST));
    }

    #[test]
    fn invalid_new_json_never_changes_existing_files() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SaveRepository::new(directory.path().to_path_buf());
        repository.write(FIRST, false).unwrap();
        repository.write(SECOND, false).unwrap();

        assert_eq!(
            repository.write("{", false).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(repository.read(false).unwrap().as_deref(), Some(SECOND));
        assert_eq!(repository.read(true).unwrap().as_deref(), Some(FIRST));
    }

    #[test]
    fn schema_recovery_preserves_backup_when_typescript_rejects_main() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SaveRepository::new(directory.path().to_path_buf());
        repository.write(FIRST, false).unwrap();
        repository.write(SECOND, false).unwrap();
        fs::write(directory.path().join(MAIN_FILE), r#"{"wrongSchema":true}"#).unwrap();

        repository.write(SECOND, true).unwrap();

        assert_eq!(repository.read(false).unwrap().as_deref(), Some(SECOND));
        assert_eq!(repository.read(true).unwrap().as_deref(), Some(FIRST));
    }

    #[cfg(windows)]
    #[test]
    fn windows_replacement_failure_keeps_locked_main_and_valid_backup() {
        use std::os::windows::fs::OpenOptionsExt;

        let directory = tempfile::tempdir().unwrap();
        let repository = SaveRepository::new(directory.path().to_path_buf());
        repository.write(FIRST, false).unwrap();
        repository.write(SECOND, false).unwrap();
        // Allow readers but deny FILE_SHARE_DELETE, so MoveFileExW is refused
        // while a normal read can still produce the recovery backup.
        let held = File::options()
            .read(true)
            .share_mode(1)
            .open(directory.path().join(MAIN_FILE))
            .unwrap();

        assert!(repository.write(r#"{"coins":50}"#, false).is_err());
        assert_eq!(repository.read(false).unwrap().as_deref(), Some(SECOND));
        assert_eq!(repository.read(true).unwrap().as_deref(), Some(SECOND));
        drop(held);
    }
}
