use serde_json::Value;

#[test]
fn native_bundle_has_independent_identity_and_only_approved_resources() {
    let config:Value=serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert_eq!(config["productName"],"AgentOffice");
    assert_eq!(config["identifier"],"local.agentoffice.desktop");
    assert_eq!(config["build"]["frontendDist"],"../dist");
    assert_eq!(config["bundle"]["windows"]["nsis"]["installMode"],"currentUser");
    // WebView2 is put in place when missing (Microsoft's own bootstrapper), never skipped.
    assert_eq!(config["bundle"]["windows"]["webviewInstallMode"]["type"],"downloadBootstrapper");
    assert_eq!(config["bundle"]["windows"]["nsis"]["installerHooks"],"installer-hooks.nsh");
    assert_eq!(config["bundle"]["useLocalToolsDir"],true);
    assert!(config.get("plugins").is_none());
    let resources=config["bundle"]["resources"].as_object().unwrap();
    let expected=["../../THIRD_PARTY_NOTICES.md","../../licenses/Coucou-MIT.txt","../../licenses/Coucou-assets-excluded.md","../../.artifacts/cargo-target/release/agentoffice-hook.exe"];
    assert_eq!(resources.len(),expected.len());
    for path in expected {assert!(resources.contains_key(path));}
    for icon in config["bundle"]["icon"].as_array().unwrap(){assert!(icon.as_str().unwrap().starts_with("icons/"));}
}
