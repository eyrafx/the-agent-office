//! Alarms and reminders: a title, a date and time on the local clock, once or repeating
//! (every day, weekdays, every week, every month), snoozed or dismissed by the user. The same
//! record serves an alarm (a time of day), a to-do's reminder (named after the to-do) and the
//! countdown (an end to the millisecond, paused with what it has left). The app
//! keeps them in the data folder. A clock thread looks every second at the wall clock (never at
//! counted ticks), so after the computer sleeps the times are still right. Each occurrence
//! rings once: which one rang is saved before anything sounds. One that came due while the
//! computer slept or the app was closed rings only if it is a moment late; otherwise it is
//! shown as missed, without sound. While AgentOffice is closed nothing rings.
use serde::{Deserialize, Serialize};

/// How late an occurrence may be and still ring with sound; up to `MISSED_MS` it is shown as missed.
pub const RING_LATE_MS: u64 = 2 * 60_000;
pub const MISSED_MS: u64 = 12 * 3600_000;
pub const MAX_REMINDERS: usize = 200;
/// A ringing alarm (or finished countdown) sounds again this often, for this long, unless snoozed or dismissed.
pub const RING_EVERY_MS: u64 = 4_000;
pub const RING_FOR_MS: u64 = 60_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Reminder {
    pub id: String,
    pub title: String,
    /// The local date and time it is set for, "2026-10-26T09:30".
    pub at: String,
    /// "once", "daily", "weekdays", "weekly", "monthly", or chosen days of the week as "days:0,2,4"
    /// (0 = Monday … 6 = Sunday).
    pub repeat: String,
    pub enabled: bool,
    /// The occurrence due next (ms since 1970), worked out from `at` and `repeat`; 0: none left.
    pub due: u64,
    /// Snoozed until (ms), if snoozed.
    pub snoozed: Option<u64>,
    /// The last occurrence that came due (rang or was missed); it never comes due again.
    pub rung: Option<u64>,
    /// Ringing now (until dismissed or snoozed).
    pub ringing: bool,
    /// The last occurrence came due while asleep or closed and was only shown, not rung.
    pub missed: bool,
    /// "reminder", "alarm", "countdown" or "todo".
    pub kind: String,
    /// A countdown: when it ends (ms); paused: what it has left (ms); and how long it was set for.
    pub ends: Option<u64>,
    pub left: Option<u64>,
    pub total: Option<u64>,
}
impl Default for Reminder { fn default() -> Self { Self { id: String::new(), title: String::new(), at: String::new(), repeat: "once".into(), enabled: true, due: 0, snoozed: None, rung: None, ringing: false, missed: false, kind: "reminder".into(), ends: None, left: None, total: None } } }

/// A local date and time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Local { pub y: i32, pub mo: u32, pub d: u32, pub h: u32, pub mi: u32 }

pub fn parse(at: &str) -> Option<Local> {
    let (date, time) = at.split_once('T')?;
    let mut d = date.split('-').map(|p| p.parse::<i64>().ok());
    let (y, mo, day) = (d.next()??, d.next()??, d.next()??);
    let mut t = time.split(':').map(|p| p.parse::<i64>().ok());
    let (h, mi) = (t.next()??, t.next()??);
    let l = Local { y: y as i32, mo: mo as u32, d: day as u32, h: h as u32, mi: mi as u32 };
    ((1..=12).contains(&l.mo) && l.d >= 1 && l.d <= month_days(l.y, l.mo) && l.h < 24 && l.mi < 60 && (2000..=2200).contains(&l.y)).then_some(l)
}
fn month_days(y: i32, m: u32) -> u32 { match m { 2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29, 2 => 28, 4 | 6 | 9 | 11 => 30, _ => 31 } }
/// Days since 1970-01-01 for a calendar date, and back (proleptic Gregorian).
fn days_from_civil(y: i32, m: u32, d: u32) -> i64 { let y = if m <= 2 { y - 1 } else { y } as i64; let era = y.div_euclid(400); let yoe = y - era * 400; let mp = (m as i64 + 9) % 12; let doy = (153 * mp + 2) / 5 + d as i64 - 1; let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; era * 146_097 + doe - 719_468 }
fn civil_from_days(z: i64) -> (i32, u32, u32) { let z = z + 719_468; let era = z.div_euclid(146_097); let doe = z - era * 146_097; let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); let mp = (5 * doy + 2) / 153; let d = (doy - (153 * mp + 2) / 5 + 1) as u32; let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; ((yoe + era * 400 + if m <= 2 { 1 } else { 0 }) as i32, m, d) }
/// 0 = Monday … 6 = Sunday.
fn weekday(y: i32, m: u32, d: u32) -> u32 { (days_from_civil(y, m, d) + 3).rem_euclid(7) as u32 }

/// The days of the week in a "days:0,2,4" repeat, in order and without repeats (0 = Monday).
fn chosen_days(repeat: &str) -> Option<Vec<u32>> {
    let list = repeat.strip_prefix("days:")?;
    let mut days: Vec<u32> = list.split(',').map(|x| x.trim().parse::<u32>().ok().filter(|d| *d < 7)).collect::<Option<_>>()?;
    days.sort_unstable(); days.dedup();
    Some(days)
}
/// A repeat as kept: a choice of days that is every day or Monday to Friday is said so; no day is once.
fn plain_repeat(repeat: &str) -> String {
    match chosen_days(repeat) {
        Some(d) if d.is_empty() => "once".into(),
        Some(d) if d.len() == 7 => "daily".into(),
        Some(d) if d == [0, 1, 2, 3, 4] => "weekdays".into(),
        Some(d) => format!("days:{}", d.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(",")),
        None if matches!(repeat, "once" | "daily" | "weekdays" | "weekly" | "monthly") => repeat.into(),
        None => "once".into(),
    }
}

/// The first occurrence of `r` at or after `from` (ms), with `to_ms` turning a local time into
/// ms (the system's time zone, so summer time is right); None when no occurrence is left.
pub fn next_at(r: &Reminder, from: u64, to_ms: &dyn Fn(Local) -> u64) -> Option<u64> {
    // A countdown ends once, to the millisecond.
    if r.kind == "countdown" { return r.ends.filter(|t| *t >= from); }
    let base = parse(&r.at)?;
    let at = |day: i64| { let (y, mo, d) = civil_from_days(day); to_ms(Local { y, mo, d, h: base.h, mi: base.mi }) };
    let start = days_from_civil(base.y, base.mo, base.d);
    if r.repeat == "once" { let t = at(start); return (t >= from).then_some(t); }
    if r.repeat == "monthly" {
        let (mut y, mut mo) = (base.y, base.mo);
        for _ in 0..1200 {
            let d = base.d.min(month_days(y, mo));
            let t = to_ms(Local { y, mo, d, h: base.h, mi: base.mi });
            if t >= from { return Some(t); }
            mo += 1; if mo > 12 { mo = 1; y += 1; }
        }
        return None;
    }
    // Daily, weekdays, chosen days, weekly: from the later of the start day and the day before `from`.
    let days = chosen_days(&r.repeat);
    let first = start.max(from as i64 / 86_400_000 - 2);
    for day in first..first + 800 {
        let (y, mo, d) = civil_from_days(day);
        let ok = match r.repeat.as_str() { "daily" => true, "weekdays" => weekday(y, mo, d) < 5, "weekly" => (day - start).rem_euclid(7) == 0, _ => days.as_ref().is_some_and(|list| list.contains(&weekday(y, mo, d))) };
        if ok { let t = at(day); if t >= from { return Some(t); } }
    }
    None
}

/// What the clock found for one reminder at `now`.
#[derive(Debug, PartialEq)]
pub enum Due { Nothing, Ring, Missed }

/// Moves one reminder on to `now`: an occurrence (or snooze) that came due rings, or, if it came
/// due long ago (asleep, closed), is marked missed; several missed at once count once. Returns
/// what happened; the reminder's state is updated (to be saved before any sound).
pub fn advance(r: &mut Reminder, now: u64, to_ms: &dyn Fn(Local) -> u64) -> Due {
    if !r.enabled || r.ringing { return Due::Nothing; }
    if let Some(until) = r.snoozed {
        if now < until { return Due::Nothing; }
        r.snoozed = None; r.ringing = true; r.missed = false;
        return if now - until <= RING_LATE_MS { Due::Ring } else { r.ringing = false; r.missed = true; Due::Missed };
    }
    let from = r.rung.map(|t| t + 60_000).unwrap_or(0);
    let Some(due) = next_at(r, from, to_ms) else { r.due = 0; return Due::Nothing };
    r.due = due;
    if now < due { return Due::Nothing; }
    // The latest occurrence that has come due (one ring for many missed).
    let mut last = due;
    while let Some(t) = next_at(r, last + 60_000, to_ms) { if t > now { break; } last = t; }
    r.rung = Some(last);
    r.due = next_at(r, last + 60_000, to_ms).unwrap_or(0);
    let late = now - last;
    if late <= RING_LATE_MS { r.ringing = true; r.missed = false; Due::Ring }
    else if late <= MISSED_MS { r.missed = true; Due::Missed }
    else { Due::Nothing }
}

/// The user dismisses a ringing (or missed) reminder; one that does not repeat is then done.
pub fn dismiss(r: &mut Reminder) { r.ringing = false; r.missed = false; r.snoozed = None; if r.repeat == "once" { r.enabled = false; } }
pub fn snooze(r: &mut Reminder, now: u64, minutes: u32) { r.ringing = false; r.missed = false; r.snoozed = Some(now + minutes.clamp(1, 120) as u64 * 60_000); }

/// A reminder as the user set it (title, time, repeat, on/off), checked; its next time worked out.
pub fn checked(mut r: Reminder, now: u64, to_ms: &dyn Fn(Local) -> u64) -> Result<Reminder, String> {
    r.title = r.title.trim().chars().take(120).collect();
    if r.title.is_empty() { r.title = "Hatırlatıcı".into(); }
    if parse(&r.at).is_none() { return Err("Tarih ve saat geçerli değil.".into()); }
    r.repeat = plain_repeat(&r.repeat);
    if !matches!(r.kind.as_str(), "reminder" | "alarm" | "countdown" | "todo") { r.kind = "reminder".into(); }
    if r.kind == "countdown" { r.repeat = "once".into(); r.left = None; if r.ends.is_none_or(|t| t <= now) { return Err("Geri sayımın süresi geçerli değil.".into()); } } else { r.ends = None; r.left = None; r.total = None; }
    if r.id.is_empty() { r.id = format!("r{now}"); }
    r.id = r.id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
    // A changed time starts afresh from now.
    r.ringing = false; r.missed = false; r.snoozed = None; r.rung = None;
    r.due = next_at(&r, now, to_ms).unwrap_or(0);
    if r.repeat == "once" && r.due == 0 { return Err("Bu zaman geçti; ileri bir zaman seç.".into()); }
    Ok(r)
}

/// The local time on this computer's clock as ms since 1970 (summer time included).
#[cfg(windows)]
pub fn local_to_ms(l: Local) -> u64 {
    use windows_sys::Win32::Foundation::{FILETIME, SYSTEMTIME};
    use windows_sys::Win32::System::Time::{SystemTimeToFileTime, TzSpecificLocalTimeToSystemTime};
    let local = SYSTEMTIME { wYear: l.y as u16, wMonth: l.mo as u16, wDayOfWeek: 0, wDay: l.d as u16, wHour: l.h as u16, wMinute: l.mi as u16, wSecond: 0, wMilliseconds: 0 };
    let mut utc: SYSTEMTIME = unsafe { std::mem::zeroed() };
    let mut ft = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    unsafe {
        if TzSpecificLocalTimeToSystemTime(std::ptr::null(), &local, &mut utc) == 0 || SystemTimeToFileTime(&utc, &mut ft) == 0 { return 0; }
    }
    let t = ((ft.dwHighDateTime as u64) << 32 | ft.dwLowDateTime as u64) / 10_000;
    t.saturating_sub(11_644_473_600_000)
}
#[cfg(not(windows))]
pub fn local_to_ms(l: Local) -> u64 { (days_from_civil(l.y, l.mo, l.d) * 86_400_000 + (l.h as i64 * 60 + l.mi as i64) * 60_000) as u64 }

#[cfg(test)]
mod tests {
    use super::*;
    // A fixed +3 h zone (as Istanbul) for the tests.
    fn tz(l: Local) -> u64 { ((days_from_civil(l.y, l.mo, l.d) * 86_400_000 + (l.h as i64 * 60 + l.mi as i64) * 60_000) - 3 * 3_600_000) as u64 }
    fn at(s: &str) -> u64 { tz(parse(s).unwrap()) }
    fn rem(at: &str, repeat: &str) -> Reminder { Reminder { id: "r1".into(), title: "Toplantı".into(), at: at.into(), repeat: repeat.into(), ..Default::default() } }
    #[test] fn dates_parse_and_weekdays_are_right() {
        assert_eq!(parse("2026-10-26T09:30"), Some(Local { y: 2026, mo: 10, d: 26, h: 9, mi: 30 }));
        assert!(parse("2026-02-30T09:30").is_none() && parse("2026-10-26T24:00").is_none() && parse("yarın").is_none());
        assert_eq!(weekday(2026, 10, 26), 0); // Monday
        assert_eq!(civil_from_days(days_from_civil(2028, 2, 29)), (2028, 2, 29));
    }
    #[test] fn repeats_come_on_the_right_days() {
        let fri = at("2026-10-30T09:00");
        assert_eq!(next_at(&rem("2026-10-26T09:00", "daily"), fri + 1, &tz), Some(at("2026-10-31T09:00")));
        assert_eq!(next_at(&rem("2026-10-26T09:00", "weekdays"), fri + 1, &tz), Some(at("2026-11-02T09:00")));
        assert_eq!(next_at(&rem("2026-10-26T09:00", "weekly"), fri, &tz), Some(at("2026-11-02T09:00")));
        assert_eq!(next_at(&rem("2026-01-31T08:00", "monthly"), at("2026-02-01T00:00"), &tz), Some(at("2026-02-28T08:00")));
        assert_eq!(next_at(&rem("2026-10-26T09:00", "once"), at("2026-10-26T09:01"), &tz), None);
        // Chosen days: Monday, Wednesday and Saturday.
        assert_eq!(next_at(&rem("2026-10-26T07:30", "days:0,2,5"), at("2026-10-26T08:00"), &tz), Some(at("2026-10-28T07:30")));
        assert_eq!(next_at(&rem("2026-10-26T07:30", "days:0,2,5"), fri, &tz), Some(at("2026-10-31T07:30")));
    }
    #[test] fn a_choice_of_days_is_kept_plainly() {
        assert_eq!(plain_repeat("days:4,0,2,2"), "days:0,2,4");
        assert_eq!(plain_repeat("days:0,1,2,3,4,5,6"), "daily");
        assert_eq!(plain_repeat("days:4,3,2,1,0"), "weekdays");
        assert_eq!(plain_repeat("days:"), "once");
        assert_eq!(plain_repeat("days:9"), "once");
        assert_eq!(plain_repeat("hourly"), "once");
        assert_eq!(plain_repeat("monthly"), "monthly");
    }
    #[test] fn an_occurrence_rings_once_and_moves_on() {
        let mut r = checked(rem("2026-10-26T09:00", "daily"), at("2026-10-26T08:00"), &tz).unwrap();
        assert_eq!(r.due, at("2026-10-26T09:00"));
        assert_eq!(advance(&mut r, at("2026-10-26T08:59"), &tz), Due::Nothing);
        assert_eq!(advance(&mut r, at("2026-10-26T09:00") + 500, &tz), Due::Ring);
        assert!(r.ringing);
        // Still ringing: nothing more; dismissed: the next is tomorrow, and this one never again.
        assert_eq!(advance(&mut r, at("2026-10-26T09:00") + 5_000, &tz), Due::Nothing);
        dismiss(&mut r);
        assert_eq!(advance(&mut r, at("2026-10-26T09:00") + 9_000, &tz), Due::Nothing);
        assert_eq!(r.due, at("2026-10-27T09:00"));
    }
    #[test] fn after_sleep_it_rings_only_if_a_moment_late_and_once_for_many() {
        // Woke 40 s after: rings.
        let mut r = checked(rem("2026-10-26T09:00", "once"), at("2026-10-26T08:00"), &tz).unwrap();
        assert_eq!(advance(&mut r, at("2026-10-26T09:00") + 40_000, &tz), Due::Ring);
        // Woke an hour after: shown as missed, no sound.
        let mut r = checked(rem("2026-10-26T09:00", "once"), at("2026-10-26T08:00"), &tz).unwrap();
        assert_eq!(advance(&mut r, at("2026-10-26T10:00"), &tz), Due::Missed);
        assert!(r.missed && !r.ringing);
        // A daily one through three days asleep: one missed (the last), then tomorrow's.
        let mut r = checked(rem("2026-10-26T09:00", "daily"), at("2026-10-26T08:00"), &tz).unwrap();
        assert_eq!(advance(&mut r, at("2026-10-29T09:30"), &tz), Due::Missed);
        assert_eq!(r.rung, Some(at("2026-10-29T09:00")));
        assert_eq!(r.due, at("2026-10-30T09:00"));
        assert_eq!(advance(&mut r, at("2026-10-29T09:31"), &tz), Due::Nothing);
    }
    #[test] fn a_countdown_rings_at_its_end_to_the_second_and_once() {
        let now = at("2026-10-26T09:00");
        let r = Reminder { id: "countdown".into(), kind: "countdown".into(), ends: Some(now + 90_500), total: Some(90_500), at: "2026-10-26T09:01".into(), ..rem("2026-10-26T09:01", "daily") };
        let mut r = checked(r, now, &tz).unwrap();
        assert_eq!((r.repeat.as_str(), r.due), ("once", now + 90_500));
        assert_eq!(advance(&mut r, now + 90_000, &tz), Due::Nothing);
        assert_eq!(advance(&mut r, now + 90_600, &tz), Due::Ring);
        dismiss(&mut r);
        assert_eq!(advance(&mut r, now + 200_000, &tz), Due::Nothing);
        // An end already past, or none, is refused; a reminder keeps no countdown fields.
        assert!(checked(Reminder { kind: "countdown".into(), ends: Some(now - 1), ..rem("2026-10-26T09:01", "once") }, now, &tz).is_err());
        let plain = checked(Reminder { ends: Some(now + 5), total: Some(5), ..rem("2026-10-26T10:00", "once") }, now, &tz).unwrap();
        assert_eq!((plain.ends, plain.total), (None, None));
    }
    #[test] fn snooze_rings_again_and_a_past_time_is_refused() {
        let mut r = checked(rem("2026-10-26T09:00", "once"), at("2026-10-26T08:00"), &tz).unwrap();
        assert_eq!(advance(&mut r, at("2026-10-26T09:00"), &tz), Due::Ring);
        snooze(&mut r, at("2026-10-26T09:00"), 10);
        assert_eq!(advance(&mut r, at("2026-10-26T09:05"), &tz), Due::Nothing);
        assert_eq!(advance(&mut r, at("2026-10-26T09:10") + 1000, &tz), Due::Ring);
        dismiss(&mut r);
        assert!(!r.enabled);
        assert!(checked(rem("2026-10-26T09:00", "once"), at("2026-10-26T10:00"), &tz).is_err());
    }
}
