use std::{
    ffi::OsStr,
    io,
    path::{Path, PathBuf},
};

pub enum StorageLocation<'a> {
    AppData(&'a Path),
    PortableExecutable(&'a Path),
}

pub fn portable_requested<I, S>(arguments: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    arguments
        .into_iter()
        .any(|argument| argument.as_ref() == OsStr::new("--portable"))
}

/// Choose one explicit storage location without probing, migrating, or reading
/// another location. The renderer cannot choose a native filesystem path.
pub fn save_directory(location: StorageLocation<'_>, development: bool) -> io::Result<PathBuf> {
    let root = match location {
        StorageLocation::AppData(directory) => directory.to_path_buf(),
        StorageLocation::PortableExecutable(executable) => executable
            .parent()
            .filter(|directory| !directory.as_os_str().is_empty())
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "missing executable directory")
            })?
            .join("ZhuJieRescueBureau-data"),
    };
    Ok(root.join(if development {
        "development"
    } else {
        "release"
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::save_repository::SaveRepository;

    #[test]
    fn portable_requires_an_explicit_exact_argument() {
        assert!(!portable_requested(["--portable=false", "some-folder"]));
        assert!(portable_requested(["--portable"]));
    }

    #[test]
    fn standard_location_preserves_existing_app_data_and_profile_separation() {
        let root = tempfile::tempdir().unwrap();
        let release = root.path().join("release");
        std::fs::create_dir(&release).unwrap();
        let original = release.join("idle-forge-save.json");
        std::fs::write(&original, "existing personal save").unwrap();

        assert_eq!(
            save_directory(StorageLocation::AppData(root.path()), false).unwrap(),
            release
        );
        assert_eq!(
            save_directory(StorageLocation::AppData(root.path()), true).unwrap(),
            root.path().join("development")
        );
        assert_eq!(
            std::fs::read_to_string(original).unwrap(),
            "existing personal save"
        );
        assert!(!root.path().join("development").exists());
        assert!(!root.path().join("ZhuJieRescueBureau-data").exists());
        assert!(!root.path().join("IdleForge-data").exists());
    }

    #[test]
    fn portable_sibling_storage_saves_and_keeps_development_separate() {
        let root = tempfile::tempdir().unwrap();
        let executable = root.path().join("ZhuJieRescueBureau.exe");
        let release =
            save_directory(StorageLocation::PortableExecutable(&executable), false).unwrap();
        let development =
            save_directory(StorageLocation::PortableExecutable(&executable), true).unwrap();
        assert_eq!(
            release,
            root.path().join("ZhuJieRescueBureau-data").join("release")
        );
        assert_eq!(
            development,
            root.path()
                .join("ZhuJieRescueBureau-data")
                .join("development")
        );
        let repository = SaveRepository::new(release);
        repository.write(r#"{"coins":1}"#, false).unwrap();
        repository.write(r#"{"coins":2}"#, false).unwrap();

        assert_eq!(
            repository.read(false).unwrap().as_deref(),
            Some(r#"{"coins":2}"#)
        );
        assert_eq!(
            repository.read(true).unwrap().as_deref(),
            Some(r#"{"coins":1}"#)
        );
        assert!(!development.exists());
    }
}
