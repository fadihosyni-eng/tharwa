// A few interface icons the game's ART.ui set doesn't have, drawn in the same style
// (24x24, 1.75 rounded strokes, currentColor, soft .16 fill). Everything else comes from ART.ui.
const F = 'fill="currentColor" fill-opacity=".16"';
const ICONS: Record<string, string> = {
  search: `<circle cx="10.5" cy="10.5" r="6.5" ${F}/><path d="M15.5 15.5 L20.5 20.5"/>`,
  library: `<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" ${F}/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2" ${F}/>`,
  chevron: `<path d="M14.5 6 L8.5 12 L14.5 18"/>`,
  back: `<path d="M9.5 6 L15.5 12 L9.5 18"/>`,
  devices: `<rect x="2.5" y="4.5" width="14" height="10" rx="1.8" ${F}/><path d="M6 18.5 H11.5"/><rect x="15.5" y="9" width="6" height="11" rx="1.6"/><path d="M18 17.6 H19"/>`,
  link: `<path d="M10 14 L14 10"/><path d="M8.6 11.4 L6.4 13.6 a3.4 3.4 0 0 0 4.8 4.8 L13.4 16.2"/><path d="M15.4 12.6 L17.6 10.4 a3.4 3.4 0 0 0 -4.8 -4.8 L10.6 7.8" ${F}/>`,
  nodownload: `<path d="M12 4 V13.5"/><path d="M8 10 L12 14 L16 10"/><path d="M4.5 16 V19 H19.5 V16" ${F}/><path d="M4 4 L20 20"/>`,
  gift: `<rect x="4" y="10" width="16" height="10" rx="1.6" ${F}/><path d="M3 7.5 H21 V10 H3 Z"/><path d="M12 7.5 V20"/><path d="M12 7.5 C10.5 4 7 4 7.2 6.2 C7.4 7.5 10 7.5 12 7.5 C14 7.5 16.6 7.5 16.8 6.2 C17 4 13.5 4 12 7.5"/>`,
};
export const icon = (name: string, cls = '') =>
  `<svg class="ui-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
