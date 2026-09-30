/* The cast of Bridges (the owner, 2026-09-30).
 *
 * *"Teddy is the main character. He's a Yorkie. His family is the rabbit who
 * is beautiful and loving… Her partner (husband) is a wolf… Then there is the
 * monkey that is always trying to foil their plans but getting it turned
 * around on him… like the roadrunner and the coyote… he's just insecure and
 * has a heart but is just misunderstood."*
 *
 * One table, read by everything that puts a character in front of the
 * learner, so a character cannot be a rabbit in the art and a squirrel in a
 * conversation:
 *
 *   - `core/names.js` takes the scenario names from here (`ru`, `en`, `sex`);
 *   - `tools/build_scenario_audio.mjs` gives a character **their own voice**
 *     (`voice`), the same in every conversation — a brand character whose
 *     voice changes between lessons is not a character — and
 *     `tools/build_scene_tracks.mjs` applies their `tone` when stitching:
 *     the owner asked for Teddy "a cute little voice", the wolf "a strong
 *     masculine voice", Monka "a little goofy weakling voice… slow and
 *     derpy". Eight studio voices cannot be all of that, so the chosen voice
 *     is shifted: `pitch` multiplies the pitch (and the formants with it,
 *     which is what makes a voice sound small), `tempo` the pace. Measured
 *     medians before the shift: Puck 157 Hz, Fenrir 152, Charon 132;
 *     Teddy lands near 190, Yarik near 123;
 *   - `tools/build_cast_art.mjs` draws them from `look`, and every scene is
 *     made with the character sheets as references;
 *   - `docs/cast.md` is the brief for anyone writing a scene, and the scenario
 *     writer reads it.
 *
 * `look` is the art prompt and describes only what is always true of the
 * character. `persona` is how they behave, for writers and for the tutor.
 * The five family and rival entries are the cast; `supporting` are the
 * avatar characters (core/avatars.js), who turn up in scenes as neighbours,
 * shopkeepers and friends.
 */

export const CAST = [
  {
    id: "teddy", ru: "Тедди", en: "Teddy", sex: "m", species: "Yorkshire terrier",
    role: "main",
    persona: "The hero. A small Yorkie with a big heart: curious, brave, cheerful, a little proud of his hair and always hungry. He learns things by trying them, loves his family, and forgives Monka every time.",
    look: "a small Yorkshire terrier puppy with a round cute face like a baby Yoda: very large dark shiny eyes, a small black button nose, big upright ears fringed with long golden-tan hair, a golden-tan face and head, a silver-grey and cream fluffy body, fluffy golden paws",
    voice: "ru-RU-Chirp3-HD-Puck", tone: { pitch: 1.22, tempo: 1.0 }, avatar: "teddy",
  },
  {
    id: "nezha", ru: "Нежа", en: "Nezha", sex: "f", species: "rabbit",
    role: "family",
    persona: "Teddy's mother. A beautiful, glamorous rabbit, warm and loving, confident and charming, with a quick wit. She keeps the family together and always has a plan. Her name, short for Нежана, means tender.",
    look: "a glamorous grown-up rabbit, the elegant mother of the family and a classic cartoon leading lady: tall and graceful with a slender figure, long upright ears, soft cream-and-white fur, long eyelashes, half-closed confident eyes, a warm knowing smile, a rose-pink silk scarf and a stylish pale-pink dress, standing with a poised hand on her hip",
    voice: "ru-RU-Chirp3-HD-Aoede", avatar: "nezha",
  },
  {
    id: "yarik", ru: "Ярик", en: "Yarik", sex: "m", species: "wolf",
    role: "family",
    persona: "Nezha's husband and Teddy's father. A big grey wolf who looks fearsome and is a softie: calm, protective, dry humour, terrible at hiding that he is proud of his family. Short for Ярослав.",
    look: "a big friendly grey wolf, tall and broad, with a thick grey-and-white coat, a gentle lopsided smile, warm amber eyes and a navy knitted jumper",
    voice: "ru-RU-Chirp3-HD-Charon", tone: { pitch: 0.93, tempo: 0.97 }, avatar: "yarik",
  },
  {
    id: "monka", ru: "Монька", en: "Monka", sex: "m", species: "monkey",
    role: "rival",
    persona: "The cosmonaut monkey — his name is a Russian nickname made of \"monkey\" (the owner's \"Monko\"). Small, goofy and a little bit evil, always sneaking around with a scheme to spoil the family's plans — and every scheme turns round on him, like the coyote's. Underneath he is insecure and jealous of a happy family, and he has a good heart that nobody notices. Never cruel, never humiliated: unlucky.",
    look: "a small, skinny, goofy brown monkey, a lovable cartoon schemer: big ears, one eyebrow raised, a sly lopsided smirk showing a gap tooth, scheming half-lidded eyes, rubbing his hands together, wearing a baggy white cosmonaut space suit a size too big with a red star patch and an open round glass helmet; no scarf",
    /* The avatar keeps its old id: profiles store it (rule 20.4's spirit). */
    voice: "ru-RU-Chirp3-HD-Fenrir", tone: { pitch: 1.1, tempo: 0.86 }, avatar: "yuri",
  },
  {
    id: "belka", ru: "Белка", en: "Belka", sex: "f", species: "squirrel",
    role: "friend",
    persona: "Nezha's best friend. A quick, chatty red squirrel who knows everyone's news, saves the day at the last minute and hides snacks everywhere.",
    look: "a small bright red squirrel with a huge fluffy tail, big sparkling eyes and a mischievous grin, wearing a little green scarf",
    voice: "ru-RU-Chirp3-HD-Zephyr", avatar: "belka",
  },
];

/* The neighbourhood: the avatar characters, available to any scene. */
export const SUPPORTING = [
  { id: "tortila", ru: "Тортила", en: "Tortila", sex: "f", species: "turtle",
    persona: "The old wise turtle next door. Slow, patient, never wrong.",
    voice: "ru-RU-Chirp3-HD-Kore", avatar: "tortila" },
  { id: "gena", ru: "Гена", en: "Gena", sex: "m", species: "crocodile",
    persona: "The grumpy crocodile who runs the corner shop. Not a morning crocodile.",
    voice: "ru-RU-Chirp3-HD-Orus", avatar: "gena" },
  { id: "lisa", ru: "Лиса", en: "Lisa", sex: "f", species: "fox",
    persona: "A sly fox, sometimes Monka's partner in a scheme — and quicker than him to switch sides.",
    voice: "ru-RU-Chirp3-HD-Leda", avatar: "lisa" },
  { id: "misha", ru: "Миша", en: "Misha", sex: "m", species: "bear",
    persona: "A big warm bear in a winter hat. Teacher, driver, doctor — whatever the scene needs.",
    voice: "ru-RU-Chirp3-HD-Orus", avatar: "misha" },
];

export const EVERYONE = CAST.concat(SUPPORTING);
export const castById = Object.fromEntries(EVERYONE.map((c) => [c.id, c]));
export const castByName = Object.fromEntries(EVERYONE.map((c) => [c.ru, c]));

/* The guide on every screen is the main character. */
export const GUIDE_ID = "teddy";
