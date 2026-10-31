//! Synced song lyrics from LRCLIB (lrclib.net, free, no account), only after the user allowed it.
//! What is sent: the track's title, artist, album and length, nothing else. Each answer, a
//! "none" too, is kept on this computer per track, so a song is asked for once (a "none" again
//! after a day, the service may have it by then).
use serde::{Deserialize, Serialize};

/// One timed line ("[01:02.34] text"): when it is sung (ms) and its words.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Line { pub t: u64, pub text: String }

/// What was found for a track: "synced" (timed lines), "plain" (words without times), "none"
/// (nothing, or an instrumental), with the time it was asked.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Lyrics { pub status: String, #[serde(default)] pub lines: Vec<Line>, #[serde(default)] pub plain: String, #[serde(default)] pub at: u64 }

/// The track's key in the kept answers.
pub fn key(title: &str, artist: &str, album: &str, duration_s: u64) -> String {
    format!("{}\u{1}{}\u{1}{}\u{1}{}", title.trim().to_lowercase(), artist.trim().to_lowercase(), album.trim().to_lowercase(), duration_s)
}

/// "[mm:ss.xx]" lines into times and words (several stamps on one line each count; metadata
/// tags such as "[ar: …]" are left out); in time order.
pub fn parse_lrc(text: &str) -> Vec<Line> {
    let mut out = vec![];
    for raw in text.lines() {
        let mut rest = raw.trim();
        let mut stamps = vec![];
        while let Some(stripped) = rest.strip_prefix('[') {
            let Some(end) = stripped.find(']') else { break };
            let stamp = &stripped[..end];
            let Some((m, s)) = stamp.split_once(':') else { break };
            let (Ok(m), Ok(s)) = (m.trim().parse::<u64>(), s.trim().parse::<f64>()) else { break };
            stamps.push(m * 60_000 + (s * 1000.0).round() as u64);
            rest = stripped[end + 1..].trim_start();
        }
        for t in stamps { out.push(Line { t, text: rest.trim().to_owned() }); }
    }
    out.sort_by_key(|l| l.t);
    out
}

/// LRCLIB's answer (its "get" or one item of its "search") as lyrics.
pub fn from_answer(v: &serde_json::Value, at: u64) -> Lyrics {
    let synced = v.get("syncedLyrics").and_then(|x| x.as_str()).map(parse_lrc).unwrap_or_default();
    let plain = v.get("plainLyrics").and_then(|x| x.as_str()).unwrap_or_default().trim().to_owned();
    if v.get("instrumental").and_then(|x| x.as_bool()) == Some(true) { return Lyrics { status: "none".into(), lines: vec![], plain: String::new(), at }; }
    if !synced.is_empty() { Lyrics { status: "synced".into(), lines: synced, plain, at } }
    else if !plain.is_empty() { Lyrics { status: "plain".into(), lines: vec![], plain, at } }
    else { Lyrics { status: "none".into(), lines: vec![], plain: String::new(), at } }
}

pub(crate) fn encode(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// Asks LRCLIB for the track: its exact entry first, else a search by title and artist whose
/// length is within a few seconds. None: the service could not be reached (nothing is kept).
#[cfg(windows)]
pub fn fetch(title: &str, artist: &str, album: &str, duration_s: u64, at: u64) -> Option<Lyrics> {
    let base = format!("track_name={}&artist_name={}", encode(title.trim()), encode(artist.trim()));
    let exact = format!("https://lrclib.net/api/get?{base}&album_name={}&duration={duration_s}", encode(album.trim()));
    match crate::site::win::get_status(&exact, 2 * 1024 * 1024) {
        Some((200, body)) => { if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&body) { return Some(from_answer(&v, at)); } }
        Some((404, _)) => {}
        _ => return None,
    }
    let (status, body) = crate::site::win::get_status(&format!("https://lrclib.net/api/search?{base}"), 4 * 1024 * 1024)?;
    if status != 200 { return None; }
    let list: Vec<serde_json::Value> = serde_json::from_slice(&body).ok()?;
    let near = list.iter().find(|v| v.get("duration").and_then(|d| d.as_f64()).is_some_and(|d| (d - duration_s as f64).abs() <= 3.0) && (v.get("syncedLyrics").and_then(|x| x.as_str()).is_some_and(|x| !x.is_empty())))
        .or_else(|| list.iter().find(|v| v.get("duration").and_then(|d| d.as_f64()).is_some_and(|d| (d - duration_s as f64).abs() <= 3.0)));
    Some(near.map(|v| from_answer(v, at)).unwrap_or(Lyrics { status: "none".into(), lines: vec![], plain: String::new(), at }))
}
#[cfg(not(windows))]
pub fn fetch(_: &str, _: &str, _: &str, _: u64, _: u64) -> Option<Lyrics> { None }

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test] fn timed_lines_are_read_in_order_and_tags_left_out() {
        let lines = parse_lrc("[ar: Someone]\n[00:12.50] first\n[01:02.00][00:05.00] twice\n[00:20.3]third\nno stamp");
        assert_eq!(lines.iter().map(|l| (l.t, l.text.as_str())).collect::<Vec<_>>(), vec![(5000, "twice"), (12500, "first"), (20300, "third"), (62000, "twice")]);
    }
    #[test] fn an_answer_is_synced_plain_or_none() {
        assert_eq!(from_answer(&json!({"syncedLyrics": "[00:01.00] a", "plainLyrics": "a"}), 1).status, "synced");
        assert_eq!(from_answer(&json!({"syncedLyrics": null, "plainLyrics": "a\nb"}), 1).status, "plain");
        assert_eq!(from_answer(&json!({"instrumental": true, "plainLyrics": "x"}), 1).status, "none");
        assert_eq!(from_answer(&json!({}), 1).status, "none");
    }
    #[test] fn only_the_track_is_put_in_the_address() {
        assert_eq!(encode("Kim yaptı lan?"), "Kim%20yapt%C4%B1%20lan%3F");
        assert_eq!(key(" Song ", "Artist", "", 201), "song\u{1}artist\u{1}\u{1}201");
    }
}
