// The small online games (server: games/*.js + lib/minigames.js). Used at build time by
// pages/play/[slug].astro and in the browser by the room client.
export type MiniGame = {
  slug: 'xo' | 'connect4' | 'ludo';
  name: string;
  tagline: string;
  icon: string;          // ART.ui icon key
  minPlayers: number;
  maxPlayers: number;
  colors: string[];      // seat colours (ludo: by board corner)
  rules: string[];
};

export const MINI_GAMES: MiniGame[] = [
  {
    slug: 'xo', name: 'إكس أو', icon: 'xmark', minPlayers: 2, maxPlayers: 2,
    tagline: 'تلاتة بخط واحد — جولة سريعة أو أفضل من 3 و5 جولات.',
    colors: ['#2fe2ff', '#ffc53d'],
    rules: [
      'اللاعب الأول بيلعب X والتاني O، وكل واحد بدوره بيحط علامته بخانة فاضية.',
      'أول واحد بيصفّ تلات علامات بخط (أفقي، عمودي أو مايل) بيربح الجولة.',
      'إذا تعبّى اللوح بلا خط، الجولة تعادل.',
      'بمباراة «أفضل من 3» أو «5»: مين بيوصل لأغلبية الجولات بيربح، واللي بيبلّش بيتبدّل كل جولة.',
    ],
  },
  {
    slug: 'connect4', name: 'أربعة بخط', icon: 'chart', minPlayers: 2, maxPlayers: 2,
    tagline: 'نزّل الأقراص بالعواميد وصفّ أربعة بخط قبل خصمك.',
    colors: ['#f0585e', '#ffc53d'],
    rules: [
      'اللوح 7 عواميد × 6 صفوف. بدورك بتختار عمود والقرص بينزل لأوطى خانة فاضية فيه.',
      'أول واحد بيصفّ 4 أقراص من لونه بخط — أفقي أو عمودي أو مايل — بيربح.',
      'إذا تعبّى اللوح كله بلا أربعة بخط، اللعبة تعادل.',
      'الأحمر بيبلّش، وبـ«جولة كمان» بيتبدّل مين بيبلّش.',
    ],
  },
  {
    slug: 'ludo', name: 'لودو', icon: 'dice', minPlayers: 2, maxPlayers: 4,
    tagline: 'ارمي النرد، طلّع قطعك واسبق الكل عالبيت — وكُل قطع غيرك.',
    colors: ['#f0585e', '#38c172', '#ffc53d', '#4f9df7'],
    rules: [
      'كل لاعب عنده 4 قطع. لازم تجيب 6 لتطلّع قطعة من البيت لخانة البداية.',
      'الـ6 بتعطيك رمية كمان، بس تالت 6 ورا بعض بتخسّرك الدور.',
      'إذا وقفت على خانة فيها قطعة لخصمك بترجّعها لبيتها وبتاخد رمية كمان — إلا على خانات النجمة وخانات البداية (آمنة).',
      'بعد لفّة كاملة بتفوت على الممر الملوّن، ولازم الرقم يكون مظبوط لتوصل للنص.',
      'أول واحد بيوصّل قطعه الأربعة بيربح، والباقي بيترتّبوا حسب مين وصل بعده.',
    ],
  },
];
export const byslug = (slug: string) => MINI_GAMES.find((g) => g.slug === slug) || null;
