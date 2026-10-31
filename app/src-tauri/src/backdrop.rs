//! Live backdrop for the glass.
//!
//! Windows 10 cannot clip its own blur to a shaped window, so the shell does
//! the sampling itself: the notch window is excluded from screen capture, the
//! desktop region behind it is read with GDI, downsampled, and served to the
//! page over a local protocol as BMP frames. The page blurs and tints them.

use std::sync::{Condvar, Mutex};
use std::time::Duration;

pub struct Frame { pub seq: u64, pub rect: (i32, i32, i32, i32), pub bmp: Vec<u8> }

/// `last` keeps counting across `clear()`: a page still waiting for frames
/// newer than an old number must not miss the frames of the next opening.
#[derive(Default)]
pub struct Backdrop { frame: Mutex<Option<Frame>>, last: std::sync::atomic::AtomicU64, changed: Condvar }

impl Backdrop {
    pub fn publish(&self, rect: (i32, i32, i32, i32), bmp: Vec<u8>) {
        if let Ok(mut slot) = self.frame.lock() {
            let seq = self.last.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            *slot = Some(Frame { seq, rect, bmp });
            self.changed.notify_all();
        }
    }
    pub fn clear(&self) {
        if let Ok(mut slot) = self.frame.lock() { if slot.is_some() { *slot = None; self.changed.notify_all(); } }
    }
    pub fn is_idle(&self) -> bool { self.frame.lock().map(|f| f.is_none()).unwrap_or(true) }
    /// Waits (bounded) for a frame newer than `after`; `None` when there is none.
    pub fn wait_after(&self, after: u64, timeout: Duration) -> Option<(u64, (i32, i32, i32, i32), Vec<u8>)> {
        let guard = self.frame.lock().ok()?;
        let (guard, _) = self.changed.wait_timeout_while(guard, timeout, |f| f.as_ref().is_none_or(|f| f.seq <= after)).ok()?;
        guard.as_ref().filter(|f| f.seq > after).map(|f| (f.seq, f.rect, f.bmp.clone()))
    }
}

/// Screen region (physical px) downsampled by `div`, as a top-down 32-bit BMP.
#[cfg(windows)]
pub fn capture(x: i32, y: i32, w: i32, h: i32, div: i32) -> Option<Vec<u8>> {
    use windows_sys::Win32::Graphics::Gdi::*;
    let (dw, dh) = ((w / div).max(1), (h / div).max(1));
    unsafe {
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() { return None; }
        let mem = CreateCompatibleDC(screen);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = dw; info.bmiHeader.biHeight = -dh;
        info.bmiHeader.biPlanes = 1; info.bmiHeader.biBitCount = 32; info.bmiHeader.biCompression = BI_RGB;
        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(mem, &info, DIB_RGB_COLORS, &mut bits, std::ptr::null_mut(), 0);
        if dib.is_null() || bits.is_null() { DeleteDC(mem); ReleaseDC(std::ptr::null_mut(), screen); return None; }
        let old = SelectObject(mem, dib);
        SetStretchBltMode(mem, HALFTONE);
        SetBrushOrgEx(mem, 0, 0, std::ptr::null_mut());
        let ok = StretchBlt(mem, 0, 0, dw, dh, screen, x, y, w, h, SRCCOPY);
        GdiFlush();
        let len = (dw * dh * 4) as usize;
        let mut bmp = Vec::with_capacity(54 + len);
        let size = 54 + len as u32;
        bmp.extend_from_slice(b"BM"); bmp.extend_from_slice(&size.to_le_bytes()); bmp.extend_from_slice(&0u32.to_le_bytes()); bmp.extend_from_slice(&54u32.to_le_bytes());
        bmp.extend_from_slice(&40u32.to_le_bytes()); bmp.extend_from_slice(&dw.to_le_bytes()); bmp.extend_from_slice(&(-dh).to_le_bytes());
        bmp.extend_from_slice(&1u16.to_le_bytes()); bmp.extend_from_slice(&32u16.to_le_bytes()); bmp.extend_from_slice(&0u32.to_le_bytes());
        bmp.extend_from_slice(&(len as u32).to_le_bytes()); bmp.extend_from_slice(&[0u8; 16]);
        let pixels = std::slice::from_raw_parts(bits as *const u8, len);
        // GDI leaves the alpha byte at 0; the decoder must see opaque pixels.
        for px in pixels.chunks_exact(4) { bmp.extend_from_slice(&[px[0], px[1], px[2], 255]); }
        SelectObject(mem, old); DeleteObject(dib); DeleteDC(mem); ReleaseDC(std::ptr::null_mut(), screen);
        (ok != 0).then_some(bmp)
    }
}

/// Keeps this window out of screen captures (so the backdrop read behind it
/// shows the desktop instead of the notch itself), or lets captures see it
/// again when the user wants the notch in screenshots and recordings.
#[cfg(windows)]
pub fn exclude_from_capture(win: &tauri::WebviewWindow, excluded: bool) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as _;
    (unsafe { SetWindowDisplayAffinity(hwnd, if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE }) } != 0).then_some(()).ok_or_else(|| "Could not change the notch's capture setting".into())
}

#[cfg(not(windows))] pub fn capture(_: i32, _: i32, _: i32, _: i32, _: i32) -> Option<Vec<u8>> { None }
#[cfg(not(windows))] pub fn exclude_from_capture(_: &tauri::WebviewWindow, _: bool) -> Result<(), String> { Ok(()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn frames_are_sequenced_and_waited_for() {
        let b = Backdrop::default();
        assert!(b.wait_after(0, Duration::from_millis(10)).is_none());
        b.publish((1, 2, 3, 4), vec![9]);
        let (seq, rect, bmp) = b.wait_after(0, Duration::from_millis(10)).unwrap();
        assert_eq!((seq, rect, bmp), (1, (1, 2, 3, 4), vec![9]));
        assert!(b.wait_after(1, Duration::from_millis(10)).is_none());
        b.publish((0, 0, 0, 0), vec![]);
        assert_eq!(b.wait_after(1, Duration::from_millis(10)).unwrap().0, 2);
        b.clear();
        assert!(b.wait_after(0, Duration::from_millis(10)).is_none());
        // Numbering continues after a clear, so a waiter on 2 sees the next frame.
        b.publish((0, 0, 0, 0), vec![]);
        assert_eq!(b.wait_after(2, Duration::from_millis(10)).unwrap().0, 3);
    }
}
