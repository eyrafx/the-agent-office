//! The file shelf: files the user dropped on the island, kept by their path only (the files
//! themselves are never moved, copied or deleted). A shelved file can be opened with its own
//! program, dragged out again (into a chat, a mail or a folder: Windows' own drag, as Explorer
//! does it) or taken off the shelf. A file that has gone (moved, renamed, deleted) is said so.
use serde::Serialize;

/// What the shelf shows of a path now.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo { pub path: String, pub name: String, pub exists: bool, pub folder: bool, pub size: u64, pub modified: u64 }

pub fn info(path: &str) -> FileInfo {
    let p = std::path::Path::new(path);
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_owned());
    match std::fs::metadata(p) {
        Ok(m) => FileInfo { path: path.into(), name, exists: true, folder: m.is_dir(), size: if m.is_dir() { 0 } else { m.len() }, modified: m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0) },
        Err(_) => FileInfo { path: path.into(), name, exists: false, folder: false, size: 0, modified: 0 },
    }
}

/// Only an absolute local path that names an existing file or folder is acted on.
fn usable(path: &str) -> bool { let p = std::path::Path::new(path); p.is_absolute() && p.exists() && !path.starts_with(r"\\") }

/// Opens it with its own program, as a double click in Explorer does: the default command of the
/// file's own menu. (ShellExecute alone fails for some default apps: a Store app such as Photos
/// answers it with SE_ERR_ACCESSDENIED / ERROR_INVALID_FUNCTION, as `Start-Process` does too, while
/// Explorer opens the file; so the menu's default command is used, and ShellExecute only if the menu
/// has none.) The error says Windows' own code. Run on a thread with COM (the main thread).
#[cfg(windows)]
pub fn open(path: &str) -> Result<(), String> {
    if !usable(path) { return Err("Dosya bulunamadı (taşınmış ya da silinmiş olabilir).".into()); }
    let menu = default_verb(path);
    if menu.is_ok() { return Ok(()); }
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC};
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
    let mut info = SHELLEXECUTEINFOW { cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32, fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI, lpFile: windows::core::PCWSTR(wide.as_ptr()), nShow: SW_SHOWNORMAL.0, ..Default::default() };
    match unsafe { ShellExecuteExW(&mut info) } {
        Ok(()) => Ok(()),
        // Said with the default app's name and Windows' own words and code (the menu's code too).
        Err(e) => Err(format!("{} bu dosyayı açamadı: Windows uygulamayı başlatamadı ({}, kod 0x{:08X}; menü komutu: {}).", default_app(path).map(|a| format!("“{a}”")).unwrap_or_else(|| "Varsayılan uygulama".into()), e.message().trim().trim_end_matches('.'), e.code().0 as u32, menu.err().unwrap_or_default())),
    }
}
/// The name of the app Windows opens this kind of file with ("Fotoğraflar"), if it says one.
#[cfg(windows)]
fn default_app(path: &str) -> Option<String> {
    use windows::Win32::UI::Shell::{AssocQueryStringW, ASSOCF_NONE, ASSOCSTR_FRIENDLYAPPNAME};
    let ext = std::path::Path::new(path).extension()?.to_string_lossy().into_owned();
    let wide: Vec<u16> = format!(".{ext}").encode_utf16().chain([0]).collect();
    let mut buf = [0u16; 260]; let mut len = buf.len() as u32;
    unsafe { AssocQueryStringW(ASSOCF_NONE, ASSOCSTR_FRIENDLYAPPNAME, windows::core::PCWSTR(wide.as_ptr()), None, Some(windows::core::PWSTR(buf.as_mut_ptr())), &mut len) }.ok().ok()?;
    let name = String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1)]);
    (!name.trim().is_empty()).then_some(name)
}
/// Windows' own "open with" window for the file, so another app can open it when the default one
/// cannot. Runs on a thread of its own (with COM): the window waits for the user.
#[cfg(windows)]
pub fn open_with(owner: Option<windows::Win32::Foundation::HWND>, path: &str) -> Result<(), String> {
    if !usable(path) { return Err("Dosya bulunamadı (taşınmış ya da silinmiş olabilir).".into()); }
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::{SHOpenWithDialog, OPENASINFO, OAIF_ALLOW_REGISTRATION, OAIF_EXEC};
    let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
    unsafe {
        let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).is_ok();
        let info = OPENASINFO { pcszFile: windows::core::PCWSTR(wide.as_ptr()), pcszClass: windows::core::PCWSTR::null(), oaifInFlags: OAIF_ALLOW_REGISTRATION | OAIF_EXEC };
        let shown = SHOpenWithDialog(owner, &info);
        if com { CoUninitialize(); }
        // Closed without a choice: nothing to say.
        match shown { Ok(()) => Ok(()), Err(e) if e.code().0 as u32 == 0x800704C7 => Ok(()), Err(e) => Err(format!("“Birlikte aç” açılamadı (kod 0x{:08X}).", e.code().0 as u32)) }
    }
}
/// The default command of the file's own (right-click) menu, invoked as Explorer does.
#[cfg(windows)]
fn default_verb(path: &str) -> Result<(), String> {
    use windows::Win32::UI::Shell::Common::ITEMIDLIST;
    use windows::Win32::UI::Shell::{ILFree, IContextMenu, IShellFolder, SHBindToParent, SHParseDisplayName, CMF_DEFAULTONLY, CMINVOKECOMMANDINFO};
    use windows::Win32::UI::WindowsAndMessaging::{CreatePopupMenu, DestroyMenu, GetMenuDefaultItem, GET_MENU_DEFAULT_ITEM_FLAGS, SW_SHOWNORMAL};
    let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
    unsafe {
        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        SHParseDisplayName(windows::core::PCWSTR(wide.as_ptr()), None, &mut pidl, 0, None).map_err(|e| format!("0x{:08X}", e.code().0 as u32))?;
        let result = (|| -> Result<(), String> {
            let code = |e: windows::core::Error| format!("0x{:08X}", e.code().0 as u32);
            let mut child: *mut ITEMIDLIST = std::ptr::null_mut();
            let folder: IShellFolder = SHBindToParent(pidl, Some(&mut child)).map_err(code)?;
            let menu: IContextMenu = folder.GetUIObjectOf(windows::Win32::Foundation::HWND::default(), &[child as *const ITEMIDLIST], None).map_err(code)?;
            let popup = CreatePopupMenu().map_err(code)?;
            const FIRST: u32 = 1;
            let done = (|| {
                menu.QueryContextMenu(popup, 0, FIRST, 0x7FFF, CMF_DEFAULTONLY).ok().map_err(code)?;
                let id = GetMenuDefaultItem(popup, 0, GET_MENU_DEFAULT_ITEM_FLAGS(0));
                if id == u32::MAX || id < FIRST { return Err("varsayılan komut yok".to_string()); }
                let info = CMINVOKECOMMANDINFO { cbSize: std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32, fMask: 0x0000_0400 /* CMIC_MASK_FLAG_NO_UI */, lpVerb: windows::core::PCSTR((id - FIRST) as usize as *const u8), nShow: SW_SHOWNORMAL.0, ..Default::default() };
                menu.InvokeCommand(&info).map_err(code)
            })();
            let _ = DestroyMenu(popup);
            done
        })();
        ILFree(Some(pidl));
        result
    }
}
/// Shows it selected in its own folder, with Windows' own call for it. (Before, `explorer.exe
/// /select,<path>` was started; a path with spaces was quoted whole, which Explorer does not read
/// as /select, so it opened its default folder, Documents.) Run on a thread with COM.
#[cfg(windows)]
pub fn reveal(path: &str) -> Result<(), String> {
    if !usable(path) { return Err("Dosya bulunamadı (taşınmış ya da silinmiş olabilir).".into()); }
    use windows::Win32::UI::Shell::Common::ITEMIDLIST;
    use windows::Win32::UI::Shell::{ILFree, SHOpenFolderAndSelectItems, SHParseDisplayName};
    let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
    unsafe {
        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        SHParseDisplayName(windows::core::PCWSTR(wide.as_ptr()), None, &mut pidl, 0, None).map_err(|e| format!("Klasör açılamadı (Windows kodu 0x{:08X}).", e.code().0 as u32))?;
        let shown = SHOpenFolderAndSelectItems(pidl, None, 0);
        ILFree(Some(pidl));
        shown.map_err(|e| format!("Klasör açılamadı (Windows: {}, kod 0x{:08X}).", e.message().trim(), e.code().0 as u32))
    }
}

/// Drags these files out of the island with Windows' own drag (copy or link, never move): the
/// call returns when they are dropped somewhere or the drag is called off. Run on the window's
/// (OLE) thread while the mouse button is down.
#[cfg(windows)]
pub fn drag_out(paths: &[String]) -> Result<bool, String> {
    use windows::Win32::System::Ole::{DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_LINK};
    use windows::Win32::UI::Shell::SHDoDragDrop;
    let data = drag_data(paths)?;
    unsafe { SHDoDragDrop(None, &data, None, DROPEFFECT_COPY | DROPEFFECT_LINK) }.map(|effect: DROPEFFECT| effect.0 != 0).map_err(|e| e.to_string())
}
/// What a drag out carries: the files as Explorer gives them (a file drop list, the same object a
/// drag from Explorer holds), so any app that takes files dropped from Explorer takes these.
#[cfg(windows)]
fn drag_data(paths: &[String]) -> Result<windows::Win32::System::Com::IDataObject, String> {
    use windows::Win32::UI::Shell::Common::ITEMIDLIST;
    use windows::Win32::UI::Shell::{BHID_DataObject, SHCreateShellItemArrayFromIDLists, SHParseDisplayName, ILFree};
    let paths: Vec<&String> = paths.iter().filter(|p| usable(p)).take(64).collect();
    if paths.is_empty() { return Err("Sürüklenecek dosya bulunamadı.".into()); }
    unsafe {
        let mut pidls: Vec<*mut ITEMIDLIST> = vec![];
        for p in &paths {
            let wide: Vec<u16> = p.encode_utf16().chain([0]).collect();
            let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
            if SHParseDisplayName(windows::core::PCWSTR(wide.as_ptr()), None, &mut pidl, 0, None).is_ok() && !pidl.is_null() { pidls.push(pidl); }
        }
        if pidls.is_empty() { return Err("Dosyalar okunamadı.".into()); }
        let items: Vec<*const ITEMIDLIST> = pidls.iter().map(|p| *p as *const ITEMIDLIST).collect();
        // The items' own data object, as Explorer makes it: it offers the file drop list (CF_HDROP)
        // apps read. (SHCreateDataObject from full ID lists offered no file drop list: GetData for
        // CF_HDROP answered DV_E_FORMATETC, so apps that take dropped files got nothing.)
        let data = SHCreateShellItemArrayFromIDLists(&items).and_then(|array| array.BindToHandler::<Option<&windows::Win32::System::Com::IBindCtx>, windows::Win32::System::Com::IDataObject>(None, &BHID_DataObject)).map_err(|e| e.to_string());
        for p in &pidls { ILFree(Some(*p)); }
        data
    }
}

/// Windows' own "open" dialog, for files to put on the shelf (several at once). Returns their
/// paths; none when the user cancels. Run on a thread of its own: the dialog waits for the user.
#[cfg(windows)]
pub fn pick(owner: Option<windows::Win32::Foundation::HWND>, title: &str) -> Result<Vec<String>, String> {
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_ALLOWMULTISELECT, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, SIGDN_FILESYSPATH};
    unsafe {
        let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).is_ok();
        let picked = (|| -> Result<Vec<String>, String> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
            let options = dialog.GetOptions().map_err(|e| e.to_string())?;
            dialog.SetOptions(options | FOS_ALLOWMULTISELECT | FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM).map_err(|e| e.to_string())?;
            let wide: Vec<u16> = title.encode_utf16().chain([0]).collect();
            let _ = dialog.SetTitle(windows::core::PCWSTR(wide.as_ptr()));
            // Cancelled: nothing picked (not an error).
            if dialog.Show(owner).is_err() { return Ok(vec![]); }
            let items = dialog.GetResults().map_err(|e| e.to_string())?;
            let mut paths = vec![];
            for i in 0..items.GetCount().map_err(|e| e.to_string())? {
                let Ok(item) = items.GetItemAt(i) else { continue };
                let Ok(name) = item.GetDisplayName(SIGDN_FILESYSPATH) else { continue };
                if let Ok(path) = name.to_string() { paths.push(path); }
                CoTaskMemFree(Some(name.0 as *const _));
            }
            Ok(paths)
        })();
        if com { CoUninitialize(); }
        picked
    }
}

#[cfg(not(windows))] pub fn pick(_: Option<()>, _: &str) -> Result<Vec<String>, String> { Err("Yalnız Windows'ta".into()) }
#[cfg(not(windows))] pub fn open(_: &str) -> Result<(), String> { Err("Yalnız Windows'ta".into()) }
#[cfg(not(windows))] pub fn reveal(_: &str) -> Result<(), String> { Err("Yalnız Windows'ta".into()) }
#[cfg(not(windows))] pub fn open_with(_: Option<()>, _: &str) -> Result<(), String> { Err("Yalnız Windows'ta".into()) }
#[cfg(not(windows))] pub fn drag_out(_: &[String]) -> Result<bool, String> { Err("Yalnız Windows'ta".into()) }

#[cfg(test)]
mod tests {
    use super::*;
    /// The real call on a real file in several ways, stopping at the first that opens it: prints
    /// what Windows answers each time. `AO_OPEN=<path>`, run with --ignored --nocapture.
    #[test] #[ignore] fn shell_open_code() {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
        use windows::Win32::UI::Shell::{ShellExecuteExW, ShellExecuteW, SHELLEXECUTEINFOW, SEE_MASK_NOASYNC, SEE_MASK_FLAG_NO_UI};
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let path = std::env::var("AO_OPEN").unwrap();
        let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
        let file = windows::core::PCWSTR(wide.as_ptr());
        let mode = std::env::var("AO_MODE").unwrap_or_default();
        unsafe {
            if mode.contains("com") { println!("SHELL com={:?}", CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)); }
            if mode.contains("menu") { println!("SHELL mode={mode} menu={:?}", default_verb(&path)); std::thread::sleep(std::time::Duration::from_secs(6)); return; }
            if mode.contains("ex") {
                let mut info = SHELLEXECUTEINFOW { cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32, fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI, lpFile: file, nShow: SW_SHOWNORMAL.0, ..Default::default() };
                let r = ShellExecuteExW(&mut info);
                println!("SHELL mode={mode} ex={:?} hinst={} last={:?}", r, info.hInstApp.0 as isize, windows::Win32::Foundation::GetLastError());
            } else {
                let verb = if mode.contains("null") { windows::core::PCWSTR::null() } else { windows::core::w!("open") };
                let r = ShellExecuteW(None, verb, file, None, None, SW_SHOWNORMAL);
                println!("SHELL mode={mode} code={} last={:?}", r.0 as isize, windows::Win32::Foundation::GetLastError());
            }
        }
    }
    /// A drag out carries the file itself as a file drop list (what an app reads when a file is
    /// dropped on it from Explorer), with the path whole (spaces and Turkish letters included).
    #[test] fn a_drag_out_carries_the_file_as_explorer_does() {
        use windows::Win32::System::Com::{CoInitializeEx, FORMATETC, DVASPECT_CONTENT, TYMED_HGLOBAL, COINIT_APARTMENTTHREADED};
        use windows::Win32::System::Ole::{CF_HDROP, ReleaseStgMedium};
        use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
        let dir = std::env::temp_dir().join("agentoffice-raf-deneme"); std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("Deneme dosyası ğüşiöç.txt"); std::fs::write(&file, "raf").unwrap();
        let path = file.to_string_lossy().into_owned();
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let data = drag_data(&[path.clone()]).unwrap();
            let format = FORMATETC { cfFormat: CF_HDROP.0, ptd: std::ptr::null_mut(), dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32 };
            let mut medium = data.GetData(&format).unwrap();
            let drop = HDROP(medium.u.hGlobal.0);
            assert_eq!(DragQueryFileW(drop, u32::MAX, None), 1);
            let mut buf = [0u16; 520];
            let n = DragQueryFileW(drop, 0, Some(&mut buf)) as usize;
            assert_eq!(String::from_utf16_lossy(&buf[..n]), path);
            ReleaseStgMedium(&mut medium);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test] fn a_gone_file_is_said_to_be_gone_and_never_acted_on() {
        let gone = info(r"C:\nowhere\agentoffice-test-missing.txt");
        assert_eq!((gone.exists, gone.name.as_str()), (false, "agentoffice-test-missing.txt"));
        assert!(!usable(r"C:\nowhere\agentoffice-test-missing.txt"));
        assert!(!usable("relative.txt"));
        let here = std::env::current_exe().unwrap();
        let found = info(&here.to_string_lossy());
        assert!(found.exists && found.size > 0 && !found.folder);
    }
}
