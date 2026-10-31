//! Running from the Microsoft Store package (MSIX) instead of the classic installer: what differs.
//! A packaged app's writes under AppData land in the package's own private copy, so the helper
//! that Claude Code runs lives in the home folder (`~\.agentoffice\bin`), outside AppData; the
//! app's own data stays private to the package. Starting with Windows is the package's startup
//! task (declared in the manifest, on by default once the user has opened the app), not the Run
//! key. The Store installs and updates the package, so no installer hook runs.

/// The task id in the package manifest (`desktop:StartupTask TaskId`).
pub const STARTUP_TASK: &str = "AgentOfficeStartup";

/// Whether this process runs with the Store package's identity.
#[cfg(windows)]
pub fn packaged() -> bool {
    static PACKAGED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *PACKAGED.get_or_init(|| {
        use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
        let mut len = 0u32;
        // 15700 (APPMODEL_ERROR_NO_PACKAGE): not packaged; 122 (buffer too small): packaged.
        unsafe { GetCurrentPackageFullName(&mut len, None) }.0 != 15700
    })
}
#[cfg(not(windows))] pub fn packaged() -> bool { false }

/// The package was started by Windows at sign-in (its startup task), not by the user.
#[cfg(windows)]
pub fn startup_activated() -> bool {
    use windows::ApplicationModel::{Activation::ActivationKind, AppInstance};
    packaged() && AppInstance::GetActivatedEventArgs().and_then(|a| a.Kind()).is_ok_and(|k| k == ActivationKind::StartupTask)
}
#[cfg(not(windows))] pub fn startup_activated() -> bool { false }

#[cfg(windows)]
fn task() -> Result<windows::ApplicationModel::StartupTask, String> {
    windows::ApplicationModel::StartupTask::GetAsync(&windows::core::HSTRING::from(STARTUP_TASK)).and_then(|op| op.join()).map_err(|e| e.message().to_string())
}

/// Whether the startup task is on (enabled by the user or by policy).
#[cfg(windows)]
pub fn startup_task_on() -> bool {
    use windows::ApplicationModel::StartupTaskState as S;
    task().and_then(|t| t.State().map_err(|e| e.message().to_string())).is_ok_and(|s| s == S::Enabled || s == S::EnabledByPolicy)
}
#[cfg(not(windows))] pub fn startup_task_on() -> bool { false }

/// Turns the startup task on or off; the state it has afterwards. Windows keeps the user's own
/// choice in Task Manager's Startup tab above the app's: then "disabled_by_user" (or by policy).
#[cfg(windows)]
pub fn set_startup_task(on: bool) -> Result<bool, String> {
    use windows::ApplicationModel::StartupTaskState as S;
    let t = task()?;
    if !on { t.Disable().map_err(|e| e.message().to_string())?; return Ok(startup_task_on()); }
    match t.RequestEnableAsync().and_then(|op| op.join()).map_err(|e| e.message().to_string())? {
        S::Enabled | S::EnabledByPolicy => Ok(true),
        S::DisabledByUser => Err("disabled_by_user".into()),
        S::DisabledByPolicy => Err("disabled_by_policy".into()),
        _ => Ok(false),
    }
}
#[cfg(not(windows))] pub fn set_startup_task(_: bool) -> Result<bool, String> { Ok(false) }
