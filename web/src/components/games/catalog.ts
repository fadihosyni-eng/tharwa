// Serva Games — built-in info for the games the site knows how to show (art, how-to, accents).
// The live registry (/api/site → games) decides what is actually playable: a game is shown only
// when it is in the registry and enabled. Fields missing from a registry entry fall back to these.
import tharwaArt from '../../assets/games/tharwa.svg?url';
import xoArt from '../../assets/games/xo.svg?url';
import connect4Art from '../../assets/games/connect4.svg?url';
import ludoArt from '../../assets/games/ludo.svg?url';

export type GameInfo = {
  slug: string;
  name: string;
  /** one short line under the name */
  description: string;
  /** a slightly longer pitch for the detail page */
  pitch: string;
  minPlayers: number;
  maxPlayers: number;
  bots: boolean;
  tags: string[];
  art: string;
  /** card glow colour */
  accent: string;
  /** search aliases (Latin names etc.) */
  aliases: string[];
  /** a typical game length */
  duration: string;
  /** 3–5 how-to bullets: [ART.ui icon, text] */
  howto: [string, string][];
};

export const CATALOG: GameInfo[] = [
  {
    slug: 'tharwa',
    name: 'ثروة',
    description: 'لعبة المدن والعقارات العربية — اشترِ، عمّر، وخلّي الكل يفلس.',
    pitch: 'اشترِ المدن العربية، عمّر بيوت وفنادق، زاود بالمزادات وأقرض صحابك بفايدة… وآخر واحد بيضل بدون إفلاس هو الربحان.',
    minPlayers: 2, maxPlayers: 8, bots: true, tags: ['party', 'board', 'strategy'],
    art: tharwaArt, accent: '#ffc53d', aliases: ['tharwa', 'monopoly', 'مونوبولي', 'عقارات', 'مدن'], duration: '30–60 د',
    howto: [
      ['dice', 'ارمي النردين وامشِ — الدبل بيعطيك دور كمان.'],
      ['house', 'اشترِ المدن والموانئ، واللي بيوقف عندك بيدفعلك إيجار.'],
      ['hotel', 'جمّع كل مدن الدولة لتعمّر بيوت وفنادق ويصير الإيجار نار.'],
      ['handshake', 'تبادل عقارات ومصاري، أو أقرض صحابك بفايدة.'],
      ['crown', 'آخر واحد بيضل بدون إفلاس هو الفائز.'],
    ],
  },
  {
    slug: 'xo',
    name: 'إكس أو',
    description: 'الكلاسيكية السريعة: صفّ 3 بخط واحد قبل صاحبك.',
    pitch: 'أسرع لعبة بالمنصة: دقيقة وحدة بتكفي لتعرف مين الأذكى. العب ضد الكمبيوتر أو تحدّى صاحبك بغرفة خاصة.',
    minPlayers: 2, maxPlayers: 2, bots: true, tags: ['duo', 'classic', 'quick'],
    art: xoArt, accent: '#2fe2ff', aliases: ['xo', 'x o', 'tic tac toe', 'tictactoe', 'اكس او', 'إكس'], duration: '1–3 د',
    howto: [
      ['users', 'لاعبين اتنين: واحد إلو X والتاني إلو O.'],
      ['hand', 'بالدور، كل واحد بيحط رمزه بأي مربع فاضي.'],
      ['trophy', 'أول واحد بيصفّ 3 بخط — نايم، واقف أو مايل — بيربح.'],
      ['scale', 'إذا امتلت اللوحة وما حدا صفّ، بتطلع تعادل.'],
    ],
  },
  {
    slug: 'connect4',
    name: 'أربعة بخط',
    description: 'نزّل أقراصك وصفّ 4 من لونك قبل ما يسكّر عليك.',
    pitch: 'لعبة تكتيك خفيفة: كل حركة إلها حساب. ركّب طريقك لأربعة بخط وسكّر الطريق على خصمك قبل ما يسبقك.',
    minPlayers: 2, maxPlayers: 2, bots: true, tags: ['duo', 'classic', 'strategy'],
    art: connect4Art, accent: '#ff5d73', aliases: ['connect4', 'connect 4', 'connect four', 'four in a row', 'اربعة', 'أربعة'], duration: '5–10 د',
    howto: [
      ['arrow', 'اختار عمود ونزّل قرصك — بيوقع لآخر مكان فاضي تحت.'],
      ['trophy', 'صفّ 4 أقراص من لونك بخط: نايم، واقف أو مايل.'],
      ['shield', 'انتبه لخصمك وسكّر عليه الطريق قبل ما يكمّل الأربعة.'],
      ['scale', 'إذا امتلت اللوحة وما حدا صفّ 4، بتطلع تعادل.'],
    ],
  },
  {
    slug: 'ludo',
    name: 'لودو',
    description: 'ارمي النرد، طلّع قطعك من البيت، وأول واحد بيوصّل الكل بيربح.',
    pitch: 'لعبة الحظ والمقالب المشهورة: سابق صحابك على اللوح، ورجّع قطعهم لبيتهم إذا وقفت عليهم.',
    minPlayers: 2, maxPlayers: 4, bots: true, tags: ['party', 'board', 'classic'],
    art: ludoArt, accent: '#5ad06b', aliases: ['ludo', 'لودو', 'ليدو'], duration: '15–30 د',
    howto: [
      ['dice', 'ارمي النرد بدورك — الـ6 بيطلّع قطعة من البيت وبيعطيك رمية كمان.'],
      ['arrow', 'امشِ بقطعك حوالين اللوح لحد ما توصل لطريق بيتك بالنص.'],
      ['bolt', 'إذا وقفت على قطعة خصمك، بترجعها على بيتها.'],
      ['crown', 'أول واحد بيوصّل قطعه كلها للنص بيربح.'],
    ],
  },
];

export const BY_SLUG: Record<string, GameInfo> = Object.fromEntries(CATALOG.map((g) => [g.slug, g]));

/** What /api/site returns per game (older registries only had `players: '2–8'`). */
export type RegistryGame = {
  slug: string; name?: string; description?: string; minPlayers?: number; maxPlayers?: number; bots?: boolean;
  enabled?: boolean; tags?: string[]; url?: string; players?: string; live?: number;
};
export type LiveGame = GameInfo & { live: number; known: boolean; url: string };

function parsePlayers(s: unknown): [number, number] | null {
  const m = String(s ?? '').match(/(\d+)\s*[–\-—]\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const one = String(s ?? '').match(/\d+/);
  return one ? [Number(one[0]), Number(one[0])] : null;
}
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

/** Registry entries → games to show (enabled only), with built-in fallbacks for missing fields. */
export function liveGames(list: RegistryGame[] | undefined | null): LiveGame[] {
  return (Array.isArray(list) ? list : [])
    .filter((g) => g && typeof g.slug === 'string' && g.enabled !== false)
    .map((g) => {
      const base = BY_SLUG[g.slug];
      const pp = parsePlayers(g.players);
      const min = num(g.minPlayers, pp ? pp[0] : base ? base.minPlayers : 2);
      const max = num(g.maxPlayers, pp ? pp[1] : base ? base.maxPlayers : min);
      return {
        slug: g.slug,
        name: g.name || base?.name || g.slug,
        description: g.description || base?.description || '',
        pitch: base?.pitch || g.description || '',
        minPlayers: min, maxPlayers: Math.max(min, max),
        bots: typeof g.bots === 'boolean' ? g.bots : !!base?.bots,
        tags: Array.isArray(g.tags) && g.tags.length ? g.tags : base?.tags || [],
        art: base?.art || '', accent: base?.accent || '#2fe2ff', aliases: base?.aliases || [],
        duration: base?.duration || '', howto: base?.howto || [],
        live: Number(g.live) || 0,
        known: !!base,
        url: `/games/${encodeURIComponent(g.slug)}`,
      };
    });
}

/** «2–4 لاعبين», «2 لاعبين» */
export const playersLabel = (min: number, max: number) => (min === max ? `${min} لاعبين` : `${min}–${max} لاعبين`);
export const isDuo = (g: { maxPlayers: number }) => g.maxPlayers === 2;
export const isParty = (g: { maxPlayers: number }) => g.maxPlayers >= 3;

/** Arabic-aware search normalisation (hamzas, taa marbuta, alef maqsura, tashkeel). */
export const norm = (s: string) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
