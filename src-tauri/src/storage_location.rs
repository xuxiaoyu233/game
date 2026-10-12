use std::{
    ffi::OsStr,
    io,
    path::{Path, PathBuf},
};

pub enum StorageLocation<'a> {
    AppData(&'a Path),
    PortableExecutable(&'a Path),
}

/// Profiles are a native allowlist: the renderer never supplies a directory or path.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SaveProfile {
    SkillPrototypeV1,
}

impl SaveProfile {
    fn directory_name(self) -> &'static str {
        match self {
            Self::SkillPrototypeV1 => "skill-prototype-v1",
        }
    }
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
pub fn save_directory(
    location: StorageLocation<'_>,
    profile: SaveProfile,
    development: bool,
) -> io::Result<PathBuf> {
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
    Ok(root
        .join(if development {
            "development"
        } else {
            "release"
        })
        .join("profiles")
        .join(profile.directory_name()))
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
        let old_main = release.join("zhujie-rescue-bureau-save.json");
        std::fs::write(&old_main, r#"{"legacy":true}"#).unwrap();
        let old_backup = release.join("zhujie-rescue-bureau-save.backup.json");
        std::fs::write(&old_backup, r#"{"legacyBackup":true}"#).unwrap();

        assert_eq!(
            save_directory(
                StorageLocation::AppData(root.path()),
                SaveProfile::SkillPrototypeV1,
                false
            )
            .unwrap(),
            release.join("profiles").join("skill-prototype-v1")
        );
        assert_eq!(
            save_directory(
                StorageLocation::AppData(root.path()),
                SaveProfile::SkillPrototypeV1,
                true
            )
            .unwrap(),
            root.path()
                .join("development")
                .join("profiles")
                .join("skill-prototype-v1")
        );
        assert_eq!(
            std::fs::read_to_string(original).unwrap(),
            "existing personal save"
        );
        let profile_directory = save_directory(
            StorageLocation::AppData(root.path()),
            SaveProfile::SkillPrototypeV1,
            false,
        )
        .unwrap();
        let repository = SaveRepository::new(profile_directory.clone());
        repository.write(r#"{"prototype":1}"#, false).unwrap();
        assert_eq!(
            std::fs::read_to_string(old_main).unwrap(),
            r#"{"legacy":true}"#
        );
        assert_eq!(
            std::fs::read_to_string(old_backup).unwrap(),
            r#"{"legacyBackup":true}"#
        );
        assert_eq!(
            std::fs::read_to_string(profile_directory.join("save.json")).unwrap(),
            r#"{"prototype":1}"#
        );
        assert!(!root.path().join("development").exists());
        assert!(!root.path().join("ZhuJieRescueBureau-data").exists());
        assert!(!root.path().join("IdleForge-data").exists());
    }

    #[test]
    fn portable_sibling_storage_saves_and_keeps_development_separate() {
        let root = tempfile::tempdir().unwrap();
        let executable = root.path().join("ZhuJieRescueBureau.exe");
        let release = save_directory(
            StorageLocation::PortableExecutable(&executable),
            SaveProfile::SkillPrototypeV1,
            false,
        )
        .unwrap();
        let development = save_directory(
            StorageLocation::PortableExecutable(&executable),
            SaveProfile::SkillPrototypeV1,
            true,
        )
        .unwrap();
        assert_eq!(
            release,
            root.path()
                .join("ZhuJieRescueBureau-data")
                .join("release")
                .join("profiles")
                .join("skill-prototype-v1")
        );
        assert_eq!(
            development,
            root.path()
                .join("ZhuJieRescueBureau-data")
                .join("development")
                .join("profiles")
                .join("skill-prototype-v1")
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
