//! Small records the island keeps for the user (notes and tasks, the focus timer): one JSON
//! file each in the app's data folder. A record is written whole through a temporary file and
//! then put in place, so a crash or a full disk never leaves half a file; the previous file is
//! kept as `.bak.json`. A file that cannot be read is moved aside (never deleted) and the
//! record starts empty.
use serde_json::Value;
use std::path::{Path, PathBuf};

/// The records the island may keep, and their size limit.
pub const NAMES: [&str; 5] = ["notes", "focus", "reminders", "water", "shelf"];
pub const MAX_BYTES: usize = 512 * 1024;

fn file(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !NAMES.contains(&name) { return Err(format!("Bilinmeyen kayıt: {name}")); }
    Ok(dir.join(format!("{name}.json")))
}

/// The record as saved; `null` when there is none yet (or it could not be read and was moved aside).
pub fn load(dir: &Path, name: &str) -> Result<Value, String> {
    let path = file(dir, name)?;
    let Ok(text) = std::fs::read_to_string(&path) else { return Ok(Value::Null) };
    match serde_json::from_str::<Value>(&text) {
        Ok(v) => Ok(v),
        Err(_) => {
            let aside = dir.join(format!("{name}.broken-{}.json", crate::relay::now()));
            let _ = std::fs::rename(&path, aside);
            Ok(Value::Null)
        }
    }
}

pub fn save(dir: &Path, name: &str, value: &Value) -> Result<(), String> {
    use std::io::Write;
    let path = file(dir, name)?;
    let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
    if text.len() > MAX_BYTES { return Err("Kayıt çok büyük; kaydedilmedi.".into()); }
    let tmp = dir.join(format!("{name}.json.tmp"));
    let mut out = std::fs::File::create(&tmp).map_err(|e| format!("Kaydedilemedi: {e}"))?;
    out.write_all(text.as_bytes()).and_then(|_| out.sync_all()).map_err(|e| format!("Kaydedilemedi: {e}"))?;
    drop(out);
    if path.exists() { let _ = std::fs::copy(&path, dir.join(format!("{name}.bak.json"))); }
    std::fs::rename(&tmp, &path).map_err(|e| format!("Kaydedilemedi: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn dir(tag: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("agentoffice-docs-{tag}-{}", crate::relay::now())); std::fs::create_dir_all(&d).unwrap(); d }
    #[test] fn a_record_comes_back_as_saved_and_keeps_the_previous_one() {
        let d = dir("roundtrip");
        assert_eq!(load(&d, "notes").unwrap(), Value::Null);
        save(&d, "notes", &json!({"items": [{"id": "a", "text": "süt al", "done": false}]})).unwrap();
        save(&d, "notes", &json!({"items": []})).unwrap();
        assert_eq!(load(&d, "notes").unwrap(), json!({"items": []}));
        assert!(d.join("notes.bak.json").exists());
        assert!(!d.join("notes.json.tmp").exists());
    }
    #[test] fn unknown_or_oversized_records_are_refused_and_a_broken_file_is_moved_aside() {
        let d = dir("refuse");
        assert!(save(&d, "../evil", &json!(1)).is_err());
        assert!(save(&d, "notes", &json!("x".repeat(MAX_BYTES + 1))).is_err());
        std::fs::write(d.join("focus.json"), "{broken").unwrap();
        assert_eq!(load(&d, "focus").unwrap(), Value::Null);
        assert!(std::fs::read_dir(&d).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with("focus.broken-")));
    }
}
