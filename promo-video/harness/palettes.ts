// The calm, colourful wallpaper of the glass beat. The lab draws the island's frosted glass from it
// and the film shows the very same picture behind the island, so what shows through matches.
export const GLASS_WALL = {
  base: ['#140f22', '#0a0d16'] as [string, string],
  blobs: [[.36, .0, .34, '#ff9a3d', .75], [.62, .05, .3, '#e2457a', .55], [.2, .45, .45, '#5a3bd8', .6], [.85, .5, .42, '#14a3a3', .5], [.5, .95, .5, '#3b1f78', .5]] as [number, number, number, string, number][],
};
/** Where the island's capture box sits on that wallpaper (css px of a 1920×1080 wall): the lab's island
 *  frame is centred (left 330) and the capture box starts 130 px into it. */
export const GLASS_ORIGIN = { x: 460, y: 0 };
