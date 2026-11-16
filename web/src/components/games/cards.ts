// Game card markup (browser side) — used by the home «ألعاب مميّزة» row and the /games library.
import { esc, fmtN, ui } from '../../lib/client';
import { icon } from '../icons';
import { playersLabel, type LiveGame } from './catalog';

export function gameCardHTML(g: LiveGame, i = 0) {
  const art = g.art
    ? `<img src="${esc(g.art)}" alt="" width="480" height="300" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async">`
    : `<span class="gcard-ph">${ui('gamepad')}</span>`;
  const live = g.live > 0 ? `<span class="gc-live">${fmtN(g.live)} عم يلعبوا هلق</span>` : '';
  const badges = [
    g.bots ? `<span class="chip-sm">${ui('robot')}ضد الكمبيوتر</span>` : '',
    `<span class="chip-sm">${ui('handshake')}مع الأصحاب</span>`,
  ].join('');
  return `<a class="gcard" href="${esc(g.url)}" style="--ac:${esc(g.accent)};--i:${i}" data-slug="${esc(g.slug)}">
    <div class="gcard-art">${art}${live}</div>
    <div class="gcard-body">
      <div class="gcard-top"><h3>${esc(g.name)}</h3><span class="gc-players">${ui('users')}${esc(playersLabel(g.minPlayers, g.maxPlayers))}</span></div>
      <p>${esc(g.description)}</p>
      <div class="gcard-foot"><div class="gc-badges">${badges}</div><span class="gc-go" aria-hidden="true">العب${icon('chevron')}</span></div>
    </div>
  </a>`;
}

