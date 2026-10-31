#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Bounds { pub x: i32, pub y: i32, pub width: u32, pub height: u32 }

/// The island's room in the notch window (CSS px): it must match `.island-area` in notch.css.
pub const ISLAND_AREA: (f64, f64) = (864.0, 476.0);

/// Physical pixels, with logical desired size scaled exactly once. Work area
/// includes taskbar placement and supports monitors left of the primary display.
pub fn notch_bounds(work: Bounds, scale: f64, expanded: bool) -> Bounds {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    // Expanded: the 620px island, its 18px shoulders, and 24px side / 40px bottom room for the
    // jelly overshoot.
    let (w, h) = if expanded { (ISLAND_AREA.0, ISLAND_AREA.1) } else { (224.0, 40.0) };
    let width = ((w * scale).round() as u32).max(1).min(work.width.max(1));
    let height = ((h * scale).round() as u32).max(1).min(work.height.max(1));
    Bounds { x: work.x + ((work.width.saturating_sub(width)) / 2) as i32, y: work.y, width, height }
}

/// Island bounds centred on `center_x` (physical) instead of the work-area
/// centre, kept inside the work area.
pub fn notch_bounds_at(work: Bounds, scale: f64, center_x: Option<i32>) -> Bounds {
    let b = notch_bounds(work, scale, true);
    let Some(cx) = center_x else { return b };
    let min = work.x; let max = work.x + work.width as i32 - b.width as i32;
    Bounds { x: (cx - b.width as i32 / 2).clamp(min, max.max(min)), ..b }
}

pub const PANEL_GAP: f64 = 12.0;
/// Limits panel plus 24px room for its jelly overshoot.
pub const PANEL_WIDTH: f64 = 384.0;

/// Window that holds the island plus the attached limits panel. The island keeps
/// its place; the panel goes right, or left when the right side lacks room.
/// Returns (window, island offset inside it, panel on the left).
pub fn with_panel(island: Bounds, work: Bounds, scale: f64) -> (Bounds, u32, bool) {
    let extra = ((PANEL_GAP + PANEL_WIDTH) * scale.max(1.0)).round() as u32;
    let right_edge = work.x + work.width as i32;
    if island.x + (island.width + extra) as i32 <= right_edge || island.x - (extra as i32) < work.x {
        (Bounds { width: island.width + extra, ..island }, 0, false)
    } else {
        (Bounds { x: island.x - extra as i32, width: island.width + extra, ..island }, extra, true)
    }
}

/// Top-edge strip, centred on the notch, that reveals it. Thin enough that
/// ordinary use of title bars and tabs does not trigger it by accident.
pub fn reveals(notch: Bounds, scale: f64, x: i32, y: i32) -> bool {
    let half = (150.0 * scale.max(1.0)).round() as i32;
    let center = notch.x + notch.width as i32 / 2;
    y >= notch.y && y <= notch.y + 1 && (x - center).abs() <= half
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn uses_work_area_and_negative_monitor_origin() {
        assert_eq!(notch_bounds(Bounds{x:-1920,y:40,width:1920,height:1040},1.0,false),Bounds{x:-1072,y:40,width:224,height:40});
    }
    #[test] fn clamps_to_small_work_area_at_high_dpi() {
        assert_eq!(notch_bounds(Bounds{x:20,y:12,width:500,height:300},2.0,true),Bounds{x:20,y:12,width:500,height:300});
    }
    #[test] fn reveal_strip_is_top_centre_only() {
        let notch = Bounds{x:680,y:0,width:560,height:344};
        assert!(reveals(notch,1.0,960,0));
        assert!(reveals(notch,1.0,810,1));
        assert!(!reveals(notch,1.0,960,3));
        assert!(!reveals(notch,1.0,700,0));
    }
    #[test] fn panel_goes_right_and_flips_left_at_the_edge() {
        let work = Bounds{x:0,y:0,width:1920,height:1040};
        let island = Bounds{x:680,y:0,width:560,height:344};
        assert_eq!(with_panel(island,work,1.0),(Bounds{x:680,y:0,width:956,height:344},0,false));
        let edge = Bounds{x:1300,y:0,width:560,height:344};
        assert_eq!(with_panel(edge,work,1.0),(Bounds{x:904,y:0,width:956,height:344},396,true));
    }
    #[test] fn scales_once() {
        assert_eq!(notch_bounds(Bounds{x:0,y:0,width:2560,height:1440},1.5,false),Bounds{x:1112,y:0,width:336,height:60});
    }
}
