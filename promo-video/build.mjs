// Encodes the rendered film (film-frames/<lang>-<format>/) for X: H.264 High, yuv420p, 30 fps,
// +faststart; one cut with the film's music (AAC 48 kHz at −19 LUFS: measured first, then set once,
// linearly, so the music keeps its own quiet start and lift) and one silent. For the Turkish wide
// cut also a 1280×720 poster and a short GIF preview.
// Usage: node build.mjs [tr-wide en-wide tr-tall ...]   (default: every rendered cut)
import { existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const cuts = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('film-frames').filter(d => existsSync(join('film-frames', d, 'cues.json')));
mkdirSync('out', { recursive: true }); mkdirSync('work', { recursive: true });
const run = args => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const mb = f => (statSync(f).size / 1048576).toFixed(1);
// High quality for small type: CRF 15, a slower preset tuned for flat, drawn pictures, and an exact
// RGB→4:2:0 conversion (Lanczos, full chroma interpolation), so letters keep their edges.
const VIDEO = ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-preset', 'slower', '-tune', 'animation', '-crf', '15', '-maxrate', '20M', '-bufsize', '40M',
  '-g', '60', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-r', '30', '-movflags', '+faststart'];
// LRA high enough that the measured music always stays in linear mode (one gain, no pumping).
const TARGET = 'I=-19:TP=-2:LRA=20';

/** Two-pass loudness: measure the music, then one linear gain to the target. */
function loudness(wav) {
  const { stderr } = spawnSync(ffmpeg, ['-hide_banner', '-i', wav, '-af', `loudnorm=${TARGET}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{')));
  return `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

for (const cut of cuts) {
  const dir = join('film-frames', cut), list = readdirSync(dir), ext = list.some(f => f.endsWith('.png')) ? 'png' : 'jpg', frames = list.filter(f => f.endsWith(`.${ext}`)).length;
  const IN = ['-framerate', '30', '-i', join(dir, `%05d.${ext}`)], VF = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p'];
  const name = `agentoffice-film-${cut}`, wav = join('work', `${cut}.wav`);
  execFileSync('node', ['audio.mjs', join(dir, 'cues.json'), wav], { stdio: 'inherit' });
  run([...IN, '-i', wav, ...VF, ...VIDEO,
    '-af', `${loudness(wav)},aresample=48000,aformat=channel_layouts=stereo`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', join('out', `${name}.mp4`)]);
  run([...IN, ...VF, ...VIDEO, '-an', join('out', `${name}-sessiz.mp4`)]);
  console.log(`out/${name}.mp4 ${(frames / 30).toFixed(1)} s ${mb(join('out', `${name}.mp4`))} MB · sessiz ${mb(join('out', `${name}-sessiz.mp4`))} MB`);
}

if (cuts.includes('tr-wide')) {
  // Poster: the island in close-up, just opened on the agents (large and sharp).
  // Taken from the lossless frame itself, not from the video.
  const at = Number(process.env.PROMO_POSTER_AT || 10.2), still = join('film-frames', 'tr-wide', `${String(Math.round(at * 30)).padStart(5, '0')}.png`);
  run(['-i', existsSync(still) ? still : 'out/agentoffice-film-tr-wide-sessiz.mp4', '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', 'out/agentoffice-film-poster.png']);
  // GIF: the island opening on hover, 960×540, 10 fps.
  run(['-ss', '7.5', '-t', '3.3', '-i', 'out/agentoffice-film-tr-wide-sessiz.mp4', '-vf',
    'fps=10,scale=960:540:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    'out/agentoffice-film-preview.gif']);
  console.log(`out/agentoffice-film-poster.png, out/agentoffice-film-preview.gif (${mb('out/agentoffice-film-preview.gif')} MB)`);
}
