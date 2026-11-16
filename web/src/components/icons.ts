// A few interface icons the game's ART.ui set doesn't have, drawn in the same style
// (24x24, 1.75 rounded strokes, currentColor, soft .16 fill). Everything else comes from ART.ui.
const F = 'fill="currentColor" fill-opacity=".16"';
const ICONS: Record<string, string> = {
  search: `<circle cx="10.5" cy="10.5" r="6.5" ${F}/><path d="M15.5 15.5 L20.5 20.5"/>`,
  library: `<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" ${F}/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2" ${F}/>`,
  chevron: `<path d="M14.5 6 L8.5 12 L14.5 18"/>`,
  back: `<path d="M9.5 6 L15.5 12 L9.5 18"/>`,
};
export const icon = (name: string, cls = '') =>
  `<svg class="ui-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
