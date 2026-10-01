"""Group the collection's vocabulary into study units and lay out a learning path.

Assignment is heuristic and deliberately conservative: a word is placed only when its
English gloss matches a topic rule on a whole-sense or word-boundary basis. Everything
unplaced falls through to the frequency spine, which is a perfectly good place to be —
the spine is the backbone of the path, not a dumping ground.

Output: data/topics.db
    topics       one row per unit (spine or branch), in path order
    unit_words   lemma -> unit, ordered by how common the word is in YOUR decks
    path         which units sit on which row of the tree, and what unlocks them

    python tools/build_topics.py
"""

import argparse
import functools
import json
import re
import sqlite3
import sys
import io
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from panel import fold, Resolver, STUB_GLOSS  # noqa: E402  (fold: the fr lookup)
from build_skeleton import spoken_ranks  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent

SPINE_UNIT = 30      # words per core unit in the first chapters…
SPINE_UNIT_LATER = 40  # …and after, when the goal videos say more (Phase 14: 30 left them 70-80 % followable)
EARLY_SPINE = 2
SPINE_UNITS = 10     # core units: ten chapters (eight left chapter 8 a 44-lesson dump)
SPINE_VERBS = 5      # verbs a spine unit carries at least — chapter 1 had one (быть)
SPINE_FR = 200       # this common in the Core-5000 ranking: spine, whatever the decks say
CLOSED_TOP = 500     # closed-class words this common are spine: no branch can take them
CLOSED = {"other", "pronoun", "possessive", "numeral"}
BRANCH_SIZE = 30     # words a side quest teaches…
BRANCH_SIZE_EARLY = 20  # …and in the first chapters, where forty nouns is a word bank
BRANCH_POS = {"noun", "verb", "adjective", "adverb"}   # a side quest's words; the closed classes are the spine's
COVER = 0.9          # a unit teaches off its video until this share of the speech is followable
SPINE_RESERVE = 0.25   # …in at most this much less than the whole unit: the rest is the commonest words
BRANCH_RESERVE = 0.3   # …and for a side quest, its topic's core words
OFFTOPIC_RANK = 1000   # an off-topic video word joins a side quest only if this common (by how many videos say it)
OFFTOPIC_SHARE = 0.25  # …and at most this share of the quest is such words
SKELETON = ROOT / "data" / "curated" / "skeleton.json"
# A reader's per-unit keeps and drops from the chapter content reviews.
UNIT_WORDS = json.loads((ROOT / "data" / "curated" / "unit_words.json").read_text(encoding="utf-8"))
# Each unit's words in named groups of related words (tools/build_word_groups.mjs
# proposes them; a person may edit the file). The sections a list is drawn in:
_GROUPS_FILE = ROOT / "data" / "curated" / "word_groups.json"
WORD_GROUPS = json.loads(_GROUPS_FILE.read_text(encoding="utf-8")) if _GROUPS_FILE.exists() else {}
GROUP_KINDS = ["verb", "noun", "describing", "little"]
UNGROUPED = []   # (unit, bare) the groups file does not place — run build_word_groups.mjs --stale


MISKINDED = []   # (unit, bare, section) a word filed in a section its class does not belong in
SPLIT_GROUPS = []   # (unit, group) a group a lesson boundary still cuts
# The section a word's class belongs in, everything else under "little" — the
# rule build_word_groups.mjs (KINDS) holds the model's answer to.
KIND_OF_POS = {"verb": "verb", "noun": "noun", "adjective": "describing", "adverb": "describing"}
# Lesson sizes, as core/questions.js cuts them (LESSON_RAMP, LESSON_SIZE):
# a lesson is the next N words of the unit, so a group stays whole only if the
# order puts it inside one N-word window.
LESSON_RAMP, LESSON_SIZE = [5, 6], 7


def lesson_size(chapter):
    return LESSON_RAMP[chapter] if 0 <= chapter < len(LESSON_RAMP) else LESSON_SIZE


def pack(blocks, size):
    """Blocks (lists of words) in order, each kept inside one `size`-word
    lesson, and returned with the blocks a lesson boundary still cuts.

    The owner, 2026-09-30: "Related words always need to be together." A
    lesson is the next `size` words, so that is a packing problem, and greedy
    filling lost it — a lesson half full with nothing small enough left to
    finish it cut the next group, 87 of 335 at first. So the whole unit is
    planned: blocks are placed earliest first and each lesson is filled to
    exactly `size`, backtracking only when a choice strands the rest — so the
    order is still commonest first wherever a clean packing allows it.
    A block larger than a lesson opens one and is cut as few times as it can
    be; a unit whose groups admit no clean packing cuts as few as it can, and
    its cuts are reported."""
    n = len(blocks)
    lens = [len(b) for b in blocks]

    @functools.lru_cache(maxsize=None)
    def plan(left, room, cuts):
        # left: bitmask of blocks still to place; room: what the lesson has
        # left; cuts: how many more blocks may run over a lesson boundary.
        if not left:
            return ()
        todo = [j for j in range(n) if left >> j & 1]
        for j in todo:
            whole = lens[j] <= room or room == size    # a block opening a lesson is never "cut" by choice
            if not whole and not cuts:
                continue
            spill = lens[j] - room if lens[j] > room else 0
            after = (size - spill % size if spill % size else size) if spill else (room - lens[j] or size)
            rest = plan(left & ~(1 << j), after, cuts - (0 if whole else 1))
            if rest is not None:
                return (j,) + rest
        # Nothing fits: fine only at the very end, where the last lesson is short.
        return None

    # The fewest cuts there can be, found by allowing none, then one, then
    # two: a unit whose groups admit no clean packing (five, five and five into
    # lessons of six) cuts one group, not every one a greedy fill strands. With
    # n cuts allowed every order is a plan, so the loop always returns.
    for cuts in range(n + 1):
        order = plan((1 << n) - 1, size, cuts)
        if order is not None:
            break
    plan.cache_clear()
    out, cut = [], []
    for j in order:
        if len(blocks[j]) > size - len(out) % size:
            cut.append(blocks[j])
        out.extend(blocks[j])
    return out, cut


_NOTES = json.loads((ROOT / "data" / "curated" / "grammar_notes.json").read_text(encoding="utf-8")).get("notes", {})


def card_words(tid):
    """The words the unit's own grammar card uses in its examples, folded. The
    card is the first thing a unit shows (the lesson's rule step), so the
    groups holding these words are taught first: chapter 1 opened on «Я —
    Тедди», «Это он» and then taught в, на, с, и, а, with я in lesson 3 and
    это in lesson 6 (the walkthrough, 2026-09-30)."""
    note = _NOTES.get(tid) or {}
    out = set()
    for ex in note.get("examples") or []:
        out |= {fold(w) for w in re.findall(r"[А-Яа-яЁё́]+", ex[0])}
    return out


def grouped(tid, chosen, meta, spoken, size):
    """The unit's words in teaching order — each group whole and inside one
    lesson, groups by their typical word — and each word's (group, section,
    place in the reading order). A word the file does not name is a group of
    its own in its frequency place and is reported, so a curriculum change
    cannot silently leave words ungrouped."""
    groups = WORD_GROUPS.get(tid) or []
    rank = lambda l: spoken.get(meta[l]["bare"], 10 ** 6)
    by_bare = {meta[l]["bare"]: l for l in chosen}
    card = card_words(tid)
    # The reading order: sections in GROUP_KINDS order, groups in the file's
    # order inside each (most useful first, as the file was asked to put them).
    reading = sorted(range(len(groups)), key=lambda g: (GROUP_KINDS.index(groups[g]["kind"])
                                                        if groups[g]["kind"] in GROUP_KINDS else 9, g))
    gord = {g: n for n, g in enumerate(reading)}
    blocks, group_of, placed, names = [], {}, set(), {}
    for g, grp in enumerate(groups):
        members = [by_bare[b] for b in grp["words"] if b in by_bare and by_bare[b] not in placed]
        if not members:
            continue
        placed.update(members)
        for l in members:
            group_of[l] = (grp["name"], grp["kind"], gord[g])
            if KIND_OF_POS.get(meta[l]["pos"], "little") != grp["kind"]:
                MISKINDED.append((tid, meta[l]["bare"], grp["kind"]))
        # By the group's middle word, not its commonest: one very common member
        # («год») would otherwise pull a group of rare ones to the front.
        rs = sorted(rank(l) for l in members)
        # A group the unit's grammar card speaks with goes first, then by rank.
        on_card = any(fold(meta[l]["bare"]) in card for l in members)
        blocks.append(((0 if on_card else 1, rs[len(rs) // 2]), g, members))
        names[id(members)] = grp["name"]
    rest = [l for l in chosen if l not in placed]
    UNGROUPED.extend((tid, meta[l]["bare"]) for l in rest)
    blocks += [((0 if fold(meta[l]["bare"]) in card else 1, rank(l)), 10 ** 6, [l]) for l in rest]
    blocks.sort(key=lambda b: (b[0], b[1]))
    order, cut = pack([members for _, _, members in blocks], size)
    SPLIT_GROUPS.extend((tid, names[id(b)]) for b in cut if id(b) in names)
    return order, group_of
# Words a video says that are not Russian to learn from it: the channel's own
# boilerplate (subscribe, like, the link below) and the grammar metalanguage a
# lesson-video talks in. They are real words, and the second kind is taught by
# the grammar reference; neither belongs in a unit because a video said it.
VIDEO_NOISE = set("""канал подписываться подписаться подписка лайк комментарий ролик выпуск
ссылка описание субтитры патреон падёж глагол предлог окончание союз спряжение
существительное прилагательное местоимение наречие""".split())
TRANSCRIPTS = ROOT / "data" / "transcripts.json"
EARLY_CHAPTERS = 3
BRANCH_MIN = 10      # below this a topic isn't worth a unit
PRIMARY_SENSES = 2   # how many of a gloss's senses may claim a topic
SENSE_WORDS = 3      # and how long such a sense may be

# Verbs a topic teaches alongside its nouns, so a chapter about food can say
# something (the pedagogy review, 2026-09-08: family was 39 nouns and an
# adjective). A verb already on the spine stays there — taught once.
BRANCH_VERBS = {
    "family":   "любить жить звать родиться расти".split(),
    "food":     "есть пить готовить заказать завтракать обедать ужинать пробовать".split(),
    "school":   "учить учиться изучать читать писать считать".split(),
    "home":     "жить спать сидеть лежать убирать мыть".split(),
    "clothes":  "носить надеть одеваться снять".split(),
    "city":     "идти ходить находиться искать".split(),
    "travel":   "ехать поехать приехать летать плыть отправляться".split(),
    "body":     "болеть чувствовать".split(),
    "nature":   "гулять расти".split(),
    "work":     "работать зарабатывать платить".split(),
    "animals":  "кормить бегать".split(),
    "sport":    "играть бегать плавать выиграть".split(),
    "emotion":  "нравиться бояться радоваться".split(),
    "speech":   "говорить сказать спросить ответить рассказывать объяснять".split(),
    "religion": "верить молиться".split(),
}

# Ordered by priority: the first rule that matches claims the word. Specific topics
# come before broad ones so "football" lands in sport, not in games-in-general.
RULES = [
    ("family",     "Family & People",   """mother father son daughter brother sister
        parent child children baby wife husband uncle aunt cousin grandmother
        grandfather grandson granddaughter relative family niece nephew widow
        neighbour neighbor friend girlfriend boyfriend bride groom twin orphan
        boy girl man woman person people guest host stranger""".split()),

    ("food",       "Food & Drink",      """bread meat fish soup salad cheese butter milk
        egg sugar salt pepper rice potato tomato cucumber apple pear berry fruit
        vegetable meal breakfast lunch dinner supper cook bake fry boil eat drink
        hungry thirsty tasty restaurant cafe menu waiter recipe dish plate fork
        spoon knife cup glass bottle wine beer vodka tea coffee juice water flour
        porridge sausage pie cake candy chocolate honey mushroom onion carrot""".split()),

    ("home",       "Home",              """house home apartment flat room kitchen bedroom
        bathroom door window wall floor ceiling roof stairs furniture table chair
        bed sofa shelf cupboard wardrobe mirror lamp curtain carpet key lock
        garden yard fence balcony garage basement attic clean wash tidy repair
        rent landlord neighbour""".split()),

    ("city",       "Around Town",       """city town village street road square park
        shop store market bank post office school library museum theatre
        theater cinema church cathedral bridge station airport hotel restaurant
        pharmacy bakery address building house block district centre center
        crossroads pavement sidewalk fountain monument""".split()),

    ("travel",     "Travel & Transport","""car bus train tram metro subway plane
        airplane aircraft ship boat bicycle bike motorcycle taxi truck drive ride
        fly sail travel trip journey voyage ticket passport luggage suitcase
        baggage arrive depart leave station platform airport port road highway
        map tourist hotel border customs visa wheel engine driver passenger""".split()),

    ("work",       "Work & Money",      """work job profession career office factory
        worker employee employer boss director manager engineer doctor teacher
        nurse driver farmer builder salary wage pay money cash coin rouble
        ruble dollar expensive cheap buy sell rich poor pension
        meeting colleague retire hire fire""".split()),

    ("school",     "School & Learning", """school university college class lesson
        student pupil teacher professor study learn teach read write book notebook
        pen pencil paper exam test grade mark homework subject
        history geography language grammar word dictionary
        library knowledge education degree diploma course lecture question answer
        example rule mistake""".split()),

    # Before body, so the clinic claims its words and body keeps the anatomy. A
    # side quest (ROADMAP A24): niche by design.
    ("medicine",   "Medicine",          """hospital clinic doctor physician surgeon
        nurse patient medicine drug pill tablet disease illness infection virus
        vaccine surgery operation treatment cure diagnosis symptom fever
        pharmacy ambulance injury wound recover recovery prescription""".split()),

    ("body",       "Body & Health",     """head face eye ear nose mouth tooth teeth
        tongue lip neck shoulder arm hand finger leg foot knee back chest heart
        stomach blood bone skin hair brain lung liver body health ill sick
        disease illness pain ache hurt doctor nurse hospital medicine pill cure
        treat heal wound injury fever cough cold flu healthy tired sleep""".split()),

    ("clothes",    "Clothes & Looks",   """clothes clothing shirt trousers pants
        skirt dress suit jacket coat hat cap shoe boot sock glove scarf belt tie
        button pocket sleeve collar wear dress undress fashion size cotton wool
        silk leather beautiful handsome ugly pretty tall short thin fat blond
        beard moustache mustache ring necklace jewellery jewelry""".split()),

    ("nature",     "Nature & Weather",  """sun moon star sky cloud rain snow wind
        storm thunder lightning fog frost ice weather warm cold hot cool wet dry
        summer winter spring autumn fall season earth ground soil stone rock sand
        mountain hill valley river lake sea ocean shore beach island forest wood
        tree leaf branch root flower grass field garden nature""".split()),

    ("animals",    "Animals",           """animal dog cat horse cow pig sheep goat
        chicken hen rooster duck goose bird eagle crow sparrow fish shark whale
        wolf bear fox hare rabbit deer elk mouse rat squirrel snake frog insect
        fly bee wasp ant spider butterfly mosquito worm tail paw wing beak fur
        feather nest cage zoo""".split()),

    ("sport",      "Sport & Games",     """sport football soccer hockey basketball
        volleyball tennis swimming skiing skating running race match game team
        player coach referee score goal win lose defeat champion championship
        tournament olympic stadium gym fitness exercise ball racket
        chess cards toy jump throw catch kick swim ski skate""".split()),

    ("art",        "Art & Music",       """art artist painting picture paint draw
        drawing sculpture statue gallery museum exhibition music musician song
        sing singer voice choir orchestra concert instrument piano guitar violin
        drum flute melody rhythm dance dancer ballet theatre theater actor
        actress stage play film movie cinema director scene poem poetry poet
        novel writer author literature culture beauty""".split()),

    # Side quests (ROADMAP A24, more of them 2026-09-07): niche by design, each
    # before the broad topic it would otherwise fall into.
    ("law",        "Law & Crime",       """law legal lawyer court judge jury trial
        verdict sentence prison jail police officer detective crime criminal thief
        theft steal robbery murder murderer guilty innocent evidence witness
        arrest fine punishment penalty justice illegal contract sue lawsuit
        bribe fraud""".split()),

    ("science",    "Science",           """science scientist research experiment
        laboratory theory hypothesis physics chemistry biology mathematics
        formula atom molecule cell gene evolution gravity energy planet universe
        galaxy space rocket satellite orbit telescope microscope discovery
        invention chemical element temperature measure""".split()),

    ("religion",   "Faith & Tradition", """god church cathedral priest monk nun
        monastery prayer pray faith belief holy saint soul sin heaven hell angel
        devil bible icon cross orthodox christian muslim jewish mosque synagogue
        religion religious christmas easter fast baptism wedding funeral ritual
        sacred temple""".split()),

    ("business",   "Business & Finance","""business company firm corporation trade
        economy economic market finance financial bank credit loan debt tax
        profit loss investment investor stock share deal customer client product
        brand advertisement advertising price cost budget income wealth
        entrepreneur startup""".split()),

    ("politics",   "Politics & Society","""state government president minister
        parliament election vote party politics political power constitution
        right freedom citizen nation nationality republic democracy
        revolution protest strike society public official mayor governor
        authority ambassador embassy treaty""".split()),

    ("military",   "Military & Conflict","""war army soldier officer general
        colonel captain sergeant navy fleet military weapon gun rifle pistol
        cannon tank bomb missile bullet shoot fight battle attack defend defence
        defense enemy ally victory defeat peace treaty troop regiment division
        uniform helmet fortress siege veteran recruit command retreat""".split()),

    ("tech",       "Technology & Media","""computer machine engine motor device
        phone telephone mobile internet website email programme program software
        data file screen keyboard camera photograph photo radio television
        newspaper magazine journalist news press article report broadcast channel
        electricity battery wire signal network system technology""".split()),

    ("time",       "Time & Numbers",    """time hour minute second day night morning
        evening afternoon week month year century today tomorrow yesterday now
        later early late clock watch calendar date monday tuesday wednesday
        thursday friday saturday sunday january february march april may june
        july august september october november december number count first second
        third half quarter dozen thousand million""".split()),

    ("emotion",    "Feelings & Mind",   """love hate like dislike happy sad angry
        afraid fear joy sorrow grief hope despair worry anxious calm nervous
        proud ashamed shame guilt jealous surprise surprised glad pleased upset
        lonely bored boring interesting interest feel feeling emotion mood think
        thought idea mind memory remember forget understand believe doubt know
        opinion dream wish want desire""".split()),

    ("speech",     "Speech & Language", """say speak talk tell ask answer reply
        question shout whisper cry scream call name word phrase sentence language
        translate translation letter message conversation discuss discussion
        argue argument agree disagree promise explain describe repeat mention
        silence silent listen hear""".split()),
]

# Only content words earn a topic. Pronouns, prepositions, particles and the rest of
# the closed class are taught on the spine, where their frequency puts them anyway.
BRANCHABLE = {"noun", "verb", "adjective"}

# English words that mean two unrelated things, one of which a topic rule wants.
# The rules read an English gloss, so every one of these was a word placed in a unit
# that has nothing to do with it: Body & Health taught «спинка» (the back of a
# chair) and Animals taught «выдерживать» beside «медведь» (ROADMAP P11.2).
#
# The rule they trigger: a homograph may only claim a word from the word's FIRST
# sense, and only when that sense carries no parenthetical. A gloss lists what a
# word mostly means first, and a parenthetical is there precisely to say "not the
# obvious reading" — «back (of a chair)». Where the homograph *is* the plain first
# sense the gloss gives no signal at all and only a reader can tell («bear» is the
# whole of выдерживать's first sense); those are OVERRIDES entries below.
#
# Each line names the word that put it here. Do not add one speculatively: a
# homograph that has never misfiled anything costs correct placements.
HOMOGRAPHS = {
    "address": "обращаться is 'appeal to', not a street address",
    "back":    "спинка is a chair's back; поддержать and сдерживать are 'support' and 'restrain'",
    "bear":    "выдерживать and переносить are 'endure', not the animal",
    "branch":  "дисциплина is a branch of science, not of a tree",
    "catch":   "услышать is 'to hear'",
    "deal":    "разбираться is 'manage', not a business deal",
    "eye":     "свидетель is an eye-witness, not part of the face",
    "file":    "подать is 'submit'",
    "fire":    "гореть is 'burn', not hiring and firing",
    "goal":    "цель is an aim, not a goal scored",
    "hand":    "правый is 'right-hand'; протянуть is 'to hand over'",
    "head":    "возглавлять is 'to lead'",
    "home":    "родной is 'native'",
    "hurt":    "вред is 'harm', not an ache",
    "ill":     "подводить is 'do an ill', i.e. let someone down",
    "match":   "соответствовать is 'correspond'",
    "party":   "вечеринка is a celebration, not a political party",
    "poor":    "страдать is 'suffer'",
    "power":   "смочь is 'be able'; воля is 'will'",
    "public":  "опубликовать is 'publish'",
    "referee": "судить and судья are 'judge' first",
    "revolution": "оборот is a rotation, not a rising",
    "ring":    "звучать is 'to sound', not jewellery",
    "school":  "плавание is swimming; 'swimming school' is a compound",
    "share":   "делить is 'divide'",
    "size":    "номер is a number",
    "spring":  "возникнуть is 'arise'",
    "storm":   "приступ is an assault or a fit",
    "study":   "наука is 'science'; School wants the verb, and gets it from BRANCH_VERBS",
    "suit":    "подходить is 'to fit'",
    "tell":    "отличать is 'tell apart'",
    "test":    "испытывать is 'experience, feel'",
    "wind":    "газ is gas; nature wants the weather",
}

# Ambiguous glosses the rules get wrong, resolved by hand. None = leave unplaced
# (the word stays in the dictionary and, if common enough, on the spine). Read from
# `python tools/audit_branches.py` on 2026-09-06, every branch, every word; the
# rule change to primary senses removed most accidents and these are the rest.
OVERRIDES = {
    "берег": "nature",     # "bank" here is a riverbank, not a branch of Sberbank
    "уж": None,            # "grass snake" is real but уж is overwhelmingly a particle
    "сеть": "tech",        # network/web, not a sports net
    "партия": "politics",  # political party, not a game
    "военный": "military",  # glossed "military man" — the man, not the family
    "армия": "military",
    "месяц": "time",       # month, though it also means crescent moon
    "холодный": "nature",  # weather cold, not the illness
    "левый": None,         # matched on the nautical "port"
    "знать": None,         # the verb "to know" swamps the noun "nobility"
    "стать": None,         # "become", not a word about animals
    "область": None,       # administrative oblast, not a field in nature

    # -- family: "people", "person", "man-" and "relative" as words, not kin
    "некоторый": None, "чужой": None, "соседний": None, "искусственный": None,
    "личность": None, "относительный": None, "любопытный": "emotion",
    "техник": "work", "звезда": "nature", "народ": "politics",
    "общественность": "politics", "нация": "politics",
    # -- food: things made of glass, and "plate" the chart
    "зеркало": "home", "стекло": "home", "таблица": None, "мелочь": None,
    "растительный": None,
    # -- home: "home" the country and "house" the theatre
    "театр": "art", "кинотеатр": "city", "клуб": "city", "аудитория": "school",
    "отечественный": "politics", "родина": "politics", "расписание": "time",
    "ровный": None, "половой": None, "снять": None, "лечь": None,
    # -- city: "post", "station", "office" and "building" in their other senses
    "школьный": "school", "училище": "school", "учебный": "school",
    "театральный": "art", "редакция": "tech", "должность": "work",
    "секрет": None, "пост": None, "экспедиция": None, "проведение": None,
    "пункт": None,
    # -- travel: "leave", "drive", "border", "plane" as other things
    "выйти": None, "кампания": None, "рубеж": None, "плоскость": None,
    "прохожий": None, "наступить": None, "край": "nature",
    # -- work: teachers, doctors, society and "fire"
    "общество": "politics", "учитель": "school",
    "учительница": "school", "произведение": "art", "взять": None,
    "свидание": None, "крепкий": None, "пожар": None, "десятка": None,
    "удаться": None, "пользоваться": None, "хозяйство": None,
    # -- school: "paper" the newspaper, "degree" the temperature, "rule" the verb
    "газета": "tech", "ноутбук": "tech", "рабочий": "work", "бухгалтерский": "work",
    "сюжет": "art", "градус": "nature", "править": "politics", "классный": None,
    "степень": None,
    # -- body: "head" the chief, "back" the rear, a gun
    "обувь": "clothes", "холод": "nature", "здравоохранение": "politics",
    "ружьё": "military", "личной": None, "глава": None, "задний": None,
    "перемена": None, "орган": None, "сердечный": None, "больница": "medicine",
    # -- clothes: "short", "thin", "fat", "ring" and "suit" in their other senses
    "позвонить": "speech", "иск": "politics", "жир": "food", "бабочка": "animals",
    "прекрасный": None, "короткий": None, "пола": None, "размер": None,
    "тонкий": None, "краткий": None, "величина": None, "жирный": None,
    "раздаться": None,
    # -- nature: "field" of industry, "rock" the fate, ice cream
    "мороженое": "food", "отрасль": "work", "придтись": None, "площадка": None,
    "рок": None,
    # -- animals
    "кошки": None,         # cat-o'-nine-tails
    # -- sport: "coach" the carriage, "ball" the dance, "race" the breed
    "поражение": "military", "вагон": "travel", "актёр": "art", "порода": "animals",
    "бригада": "work", "бал": "art", "удар": None, "потерять": None, "терять": None,
    "шар": None, "раса": None,
    # -- art: "play" the verb, "stage" the phase, "instrument" the gun
    "орудие": "military", "играть": None, "игра": None, "приближение": None,
    "этап": None, "стадия": None, "фигура": None, "втора": None,
    # -- politics: "power" the energy, "state" the condition, "public" the vowel
    "электроэнергия": "tech", "энергетика": "tech", "сила": None, "процесс": None,
    "состояние": None, "верный": None, "гласный": None,
    # -- military: "general" the adjective, "peace" the quiet, "division" the section
    "начальство": "work", "мир": None, "общий": None, "покой": None, "раздел": None,
    "генеральный": None, "всеобщий": None,
    # -- tech: "article" the goods, "report" the gunshot, "system" the order
    "товар": "work", "выстрел": "military", "весть": "speech", "опыт": None,
    "карточка": None, "строй": None, "схема": None,
    # -- time: "watch" the verb, "minute" the adjective, "number" the headcount
    "имя": None, "бывший": None, "численность": None, "посмотреть": None,
    "подробный": None,
    # -- emotion: "like" the preposition, "want" the need, "thought" the Duma
    "дума": "politics", "подобный": None, "уметь": None, "рада": None,
    "выглядеть": None, "потребность": None, "хотеться": None, "внезапный": None,
    "чаять": None,
    # -- speech: "call" as summon, visit, drop in; "sentence" the verdict
    "приговор": "politics", "вызвать": None, "вызывать": None, "визит": None,
    "вызов": None, "велеть": None, "заходить": None, "зайти": None, "мол": None,
    # -- second pass, the words that moved up to fill the gaps
    "дежурный": None, "практик": None, "витрина": "city", "клавиша": "tech",
    "снимать": None, "сочетание": None, "стеклянный": "home",
    "обращение": None, "квадратный": None, "радиостанция": "tech",
    "оставить": None, "механический": "tech", "огонь": None, "творчество": "art",
    "заказать": None,
    # -- third pass: "back" the verb, "hand" of a clock, "division" the arithmetic
    "возвращаться": None, "отдать": None, "языковый": None, "стрелка": None,
    "относиться": None, "поддерживать": None, "деление": None, "разделение": None,
    "святая": None, "затишье": None, "узнать": None,
    # -- medicine: "operation" the action, "treatment" the processing, "injury" the insult
    "доктор": "medicine", "действие": None, "процедура": None, "обработка": None,
    "обида": None, "поправка": None, "наркотика": None,
    # -- law: "sentence" the grammar, "officer" the soldier
    "предложение": None, "фраза": "speech", "командир": "military", "офицер": "military",
    # -- science: "cell" the camera, "space" the gap, "measure" the step
    "камера": "tech", "метр": None, "мера": None, "промежуток": "time", "расстояние": None,
    "сантиметр": None, "энергетический": "tech",
    # -- religion: "fast" the speed, "temple" of the head, "belief" the conviction
    "быстрый": None, "скорый": None, "висок": "body", "убеждение": "emotion",
    # -- business: "deal" the change, "stock" the supply, "trade" the craft
    "сдача": None, "учёт": None, "запас": None, "мастерство": None, "воспользоваться": None,
    "публикация": "tech", "хозяйственный": None, "потеря": None,

    # -- fourth pass (ROADMAP P11.2, 2026-09-10): the homographs HOMOGRAPHS cannot
    # reach, because the wrong reading is the gloss's own plain first sense.
    "выдерживать": None, "выдержать": None,   # "bear" = endure, beside медведь
    "переносить": None,                       # likewise
    "вечеринка": None,                        # "party" the celebration, in Politics
    "протянуть": None,                        # "to hand", in Body & Health
    "соответствовать": None,                  # "match" = correspond, in Sport
    "подать": None,                           # "to file" = submit, in Technology
    "отличать": None,                         # "tell" = tell apart, in Speech
    "кнопка": "tech",                         # a push-button, not a shirt's
    "инструмент": None,                       # a tool before a musical instrument
    "упасть": None,                           # "to fall", not the season, in Nature
    "правый": None,                           # "right-hand" put a direction in Body,
                                              # as "port" once put «левый» there
    # …and the words that came up behind them to fill a capped branch. A cap means
    # evicting one word admits the next: read the audit again after any change here.
    "зажигать": None,                         # "set fire" is to light a lamp
    "связать": None,                          # "tie together", not a necktie
    "марина": None,                           # a seascape, and mostly the name
    "выскочить": None, "догонять": None,      # "jump out", "catch up": not sport
    # "state" = say, not the polity — and left unplaced rather than moved into
    # Speech, where at the cap they would have displaced объяснить, перевести and
    # повторить, which is a worse unit than the one we started with.
    "высказать": None, "высказывать": None, "излагать": None,
    "митинг": "politics",                     # a rally, never a business meeting
    "молодец": None,                          # "good job" is praise, not employment
    "сделка": "business",                     # a deal really is a business deal

    # -- fifth pass (2026-09-20): the glosses of every curriculum word were
    # re-read and ~200 rewritten (gloss_overrides.json "_4"), and the rules read
    # the glosses, so sixteen words changed branch on a rebuild that was meant
    # to change what a word *says*, not where it is taught. Each is pinned to
    # the unit the audited curriculum already had it in; the arrivals that
    # briefly filled their slots (океан, май, протокол…) leave again. A word
    # that moves house takes its lesson boundary with it and the scenarios'
    # vocabulary gate with that (§30n).
    "ремонт": "home", "касса": "work", "наступать": "travel", "температура": "science",
    "головной": "body", "источник": "nature", "плавание": "sport", "статья": "tech",
    "акция": "business", "оценивать": "business", "мина": "military", "автомат": "tech",
    "номер": "time", "волнение": "emotion", "обсуждаться": "speech", "указывать": "speech",
}

# A chapter is one spine unit plus the side quests that follow it, each unit
# built towards its own video (data/curated/skeleton.json, Phase 14).
#
# The chapter title names what its side quests cover; the spine name describes
# what the spine unit actually teaches, read off the word lists after a build
# (`python tools/build_topics.py` prints them) — its goal video decides most
# of it now, so a changed skeleton means re-reading these. Index-aligned with
# the skeleton's chapters.
CHAPTERS = [
    ("First Words",            "Family and Food"),
    ("People & Places",        "Phones and Home"),
    ("The Little Words",       "Town and Time"),
    ("Winter & Gifts",         "Travel, Talk and Clothes"),
    ("Spending & Saving",      "Work, Business and Feelings"),
    ("Before & After",         "Body, Animals and Science"),
    ("Feelings & Fears",       "School, Art and Nature"),
    ("Cooking & Celebrating",  "Sport and Society"),
    ("Style & Fashion",        "Faith and Health"),
    ("Forests & Seasons",      "Law and Conflict"),
]

# --- which quests are genuinely optional -------------------------------
# Until 2026-09-22 *every* branch was optional and the next chapter needed
# only the spine (§30e). The owner changed that: *"all parallel nodes must
# be completed before moving down a node unless there are specifically
# optional lessons. Optional lessons should be about niche subjects. Like
# imagine the core lesson path is sports, well maybe there's an optional
# lesson for soccer or basketball."*
#
# So the default is now required, and this is the exception list: the
# subjects a learner can speak Russian without. The cut is "would someone
# living in the language need this to get through a week?" — a doctor, a
# kitchen, clothes and a bus, yes; a courtroom, a liturgy, a balance sheet
# and a battalion, no. They are also the four §30h added late as niche
# quests in the first place, plus the three hobbies.
#
# It is a judgement, and it is here rather than in the app because the
# path and the gate must read one source (§22). Changing it changes when
# chapters unlock: re-run `tools/audit_branches.py` and look at what a
# learner is now required to finish.
OPTIONAL = {"military", "sport", "art", "politics", "science", "law",
            "religion", "business"}


PARENS = re.compile(r"\([^)]*\)")

SCHEMA = """
drop table if exists topics;
drop table if exists unit_words;
drop table if exists path;
drop table if exists chapters;

create table topics (
  id     text primary key,
  name   text not null,
  kind   text not null,          -- 'spine' | 'branch'
  ord    integer not null,
  n      integer not null default 0,
  opt    integer not null default 0  -- a side quest the chapter does not require
);

create table unit_words (
  topic_id text not null references topics(id),
  lemma_id integer not null,
  ord      integer not null,
  reason   text,                 -- which rule placed it, for auditing
  grp      text,                 -- its group of related words (word_groups.json)
  gkind    text,                 -- the section that group sits in: verb, noun, describing, little
  gord     integer               -- the group's place in the reading order of the unit's list
);

create table path (
  row      integer not null,     -- vertical position in the tree
  col      integer not null,     -- 0 = spine, +/-1 = branches
  topic_id text not null references topics(id),
  requires text                  -- topic that must come first
);

create table chapters (
  n        integer primary key,   -- 1-based, the number the learner sees
  title    text not null,         -- what the chapter collectively covers
  spine_id text not null references topics(id)
);

create index idx_unit_words on unit_words(topic_id, ord);
"""


def compile_rules():
    out = []
    for tid, name, words in RULES:
        pat = re.compile(r"\b(" + "|".join(re.escape(w) for w in sorted(set(words))) + r")\b")
        out.append((tid, name, pat))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--pool", type=int, default=4000,
                    help="how many of the collection's commonest lemmas to consider")
    args = ap.parse_args()

    src = sqlite3.connect(f"file:{args.lexicon}?mode=ro", uri=True)
    src.execute("attach database ? as c", (str(args.corpus),))

    # The candidate pool: lemmas ranked by how often they actually occur in the decks.
    # A token is counted once, for the one lemma its form belongs to (panel.py
    # resolve(): the headword over the inflection it could be, stubs demoted,
    # the curated overrides for the rest); a form the rule cannot settle counts
    # for nobody. Two earlier counts each put wrong words on the spine: crediting
    # every owner made «житься» a chapter-1 word on the strength of «нет», and
    # crediting once *per paradigm row* — the forms table lists a key several
    # times for one lemma — made «быль» five times and «лета» fifty times as
    # common as they are (CLAUDE.md §23).
    resolver = Resolver(src)
    counts, unsettled = {}, 0
    for key, n in src.execute("select key, count(*) from c.item_tokens group by key"):
        lid = resolver.owner_id(key)
        if lid is None:
            unsettled += n if resolver.candidates(key) else 0
            continue
        counts[lid] = counts.get(lid, 0) + n
    pool = sorted(counts.items(), key=lambda x: -x[1])[:args.pool]

    meta = {}
    for lid, n in pool:
        row = src.execute(
            "select bare, accented, pos, en from lemmas where id=?", (lid,)).fetchone()
        # An inflection dressed as a headword ("genitive of I") is not a word to
        # teach; the pronoun it belongs to is on the spine already.
        if row and row[3] and not STUB_GLOSS.match(row[3]):
            meta[lid] = {"bare": row[0], "acc": row[1], "pos": row[2],
                         "en": row[3], "n": n}

    # One word, one lesson. OpenRussian carries several rows for one form — я as
    # pronoun and as "other", мой as adjective and as possessive — and `forms`
    # maps the surface key to every one of them, so they tie on count and all
    # arrived on the spine: chapter 1 taught я in lesson 1 and again in lesson 2.
    # Keep one row per bare form, preferring a real part of speech over "other".
    # NAMES: forms the corpus counts as a common word but which are a proper name
    # in every sentence — «Том» is Tom, not a volume — kept out of every unit.
    POS_RANK = {"other": 9, "possessive": 8}
    # …and STUBS: OpenRussian rows that are an inflection dressed as a headword
    # («двух» is a form of «два», glossed "both"), which no learner should meet as
    # a word of their own.
    NAMES = {"том"}
    STUBS = {"двух", "житься"}
    seen_bare, deduped = {}, []
    for lid, n in pool:
        m = meta.get(lid)
        if not m or m["bare"] in NAMES or m["bare"] in STUBS:
            continue
        key = m["bare"]
        if key in seen_bare:
            # Same form already placed with the same count: keep the better row.
            kept = seen_bare[key]
            if meta[kept]["n"] == n and POS_RANK.get(m["pos"], 0) < POS_RANK.get(meta[kept]["pos"], 0):
                deduped[deduped.index(kept)] = lid
                seen_bare[key] = lid
            continue
        seen_bare[key] = lid
        deduped.append(lid)
    dropped = len([1 for lid, _ in pool if lid in meta]) - len(deduped)

    # --- the units are built towards their videos (ROADMAP Phase 14, V3) -----
    # The owner, 2026-09-29: the video skeleton is "the framework as well as
    # the goal of everything". data/curated/skeleton.json names each chapter's
    # goal video and its side quests' videos, in the order a learner meets
    # them (tools/build_skeleton.py). Walking that route, each unit teaches
    # first the words its video says most that nothing earlier has taught,
    # until the video is COVER followable by the unit's end; only then does it
    # top up — a spine unit with the commonest spoken Russian not yet taught
    # (the forced words first: the closed classes and the Core-5000 top, as
    # before), a side quest with its own topic's words. The frequency spine of
    # old is therefore still here, as the top-up rather than the whole.
    fr = {}
    for rk, f in src.execute("select ru_key, freq_rank from c.items"
                             " where kind='vocab' and freq_rank is not null"):
        fr.setdefault(rk, f)
    forced = [lid for k, lid in enumerate(deduped)
              if (meta[lid]["pos"] in CLOSED and k < CLOSED_TOP)
              or fr.get(fold(meta[lid]["bare"]), 10 ** 9) <= SPINE_FR]
    dedup_set = set(deduped)
    by_bare = {}
    for lid in deduped:
        by_bare.setdefault(meta[lid]["bare"], []).append(lid)
    # A reader's keep is a decision about the curriculum, and the pool (the
    # decks' commonest --pool lemmas) is only where the rest of it is drawn
    # from: «лиса», «сова», «шарф» are rare in his decks and are exactly what an
    # Animals or a Clothes quest is for. So a keep outside the pool is brought
    # in from the lexicon — the real headword, glossed, by class.
    # Such a word is the keeping unit's alone: it is in the pool only because
    # that unit asked for it, so an earlier spine unit must not take it for
    # being common in its own video (the first cut taught «крокодил» in
    # chapter 2).
    KEEP_POS = {"noun": 0, "verb": 1, "adjective": 2, "adverb": 3}
    reserved = {}
    keepers = {}
    for tid, v in UNIT_WORDS.items():
        for b in (v.get("keep", []) if isinstance(v, dict) else []):
            keepers.setdefault(b, tid)
    for bare, keeper in sorted(keepers.items()):
        if bare in by_bare:
            continue
        rows = [r for r in src.execute("select id, bare, accented, pos, en from lemmas where bare=?", (bare,))
                if r[4] and not STUB_GLOSS.match(r[4])]
        if not rows:
            continue
        lid, b, acc, pos, en = min(rows, key=lambda r: (KEEP_POS.get(r[3], 9), -counts.get(r[0], 0)))
        meta[lid] = {"bare": b, "acc": acc, "pos": pos, "en": en, "n": counts.get(lid, 0)}
        deduped.append(lid)
        dedup_set.add(lid)
        by_bare[b] = [lid]
        reserved[lid] = keeper

    # What each topic rule would claim, before any unit is built: the pool a
    # side quest tops up from. The spine no longer takes its words first, so
    # nothing is excluded here; a word is taught by whichever unit reaches it.
    rules = compile_rules()
    topic_of = {}
    by_topic = {t: [] for t, _, _ in rules}
    for tid, verbs in BRANCH_VERBS.items():
        for bare in verbs:
            for lid in by_bare.get(bare, []):
                if meta[lid]["pos"] == "verb" and lid not in topic_of:
                    topic_of[lid] = tid
                    by_topic[tid].append((lid, meta[lid]["n"], "verb"))
                    break
    for lid, m in meta.items():
        if lid not in dedup_set or m["pos"] not in BRANCHABLE or lid in topic_of:
            continue
        if m["bare"] in OVERRIDES:
            tid = OVERRIDES[m["bare"]]
            if tid:
                topic_of[lid] = tid
                by_topic[tid].append((lid, m["n"], "manual"))
            continue
        # Parentheticals are disambiguators, not meanings: "on (date)" must not
        # make на a word about time. Only the PRIMARY senses count — the first
        # two, and each at most three words — because a word is what it mostly
        # means: стекло is "glass" the material before it is a drinking glass.
        senses = [(PARENS.sub(" ", s).strip(), "(" in s)
                  for s in re.split(r"[,;]", m["en"].lower())]
        primary = [(k, s, qualified)
                   for k, (s, qualified) in enumerate(senses[:PRIMARY_SENSES])
                   if s and len(s.split()) <= SENSE_WORDS]
        for tid, _, pat in rules:
            hit = None
            for k, sense, qualified in primary:
                found = pat.search(sense)
                if not found:
                    continue
                # HOMOGRAPHS: a word with two unrelated English readings may only
                # claim a lemma from its plain first sense.
                if found.group(1) in HOMOGRAPHS and (k > 0 or qualified):
                    continue
                hit = sense
                break
            if hit:
                topic_of[lid] = tid
                by_topic[tid].append((lid, m["n"], hit))
                break
    for tid in by_topic:
        by_topic[tid].sort(key=lambda w: (w[2] != "verb", -w[1]))

    skeleton = json.loads(SKELETON.read_text(encoding="utf-8"))
    index = json.loads(TRANSCRIPTS.read_text(encoding="utf-8"))["index"]
    spoken = spoken_ranks(index)
    counts = {vid: {b: len(m) for b, m in words.items()} for vid, words in index.items()}
    rule_ids = [t for t, _, _ in rules]
    in_skeleton = {t for c in skeleton["chapters"] for t in c["quests"]}
    # A topic the skeleton found no video for keeps its place, in the last
    # chapter, built from its rule as before (Law and Military, 2026-09-29).
    orphans = [t for t in rule_ids if t not in in_skeleton]

    def followable(vid, known):
        c = counts.get(vid) or {}
        total = sum(c.values())
        return sum(n for b, n in c.items() if b in known) / total if total else 0

    route = []   # (unit id, kind, chapter index, video id or None)
    for k, ch in enumerate(skeleton["chapters"]):
        route.append((f"core{k + 1}", "spine", k, ch["spine"]))
        for t, vid in ch["quests"].items():
            route.append((t, "branch", k, vid))
    last = len(skeleton["chapters"]) - 1
    route += [(t, "branch", last, None) for t in orphans]

    # The same videos measured against the curriculum this build replaces, so
    # the change is a number (before → after) rather than a claim.
    before = {}
    if args.out.exists():
        old = sqlite3.connect(f"file:{args.out}?mode=ro", uri=True)
        old.execute("attach database ? as lex", (str(args.lexicon),))
        old_words = {}
        for tid, bare in old.execute("select u.topic_id, l.bare from unit_words u"
                                     " join lex.lemmas l on l.id = u.lemma_id order by u.topic_id, u.ord"):
            old_words.setdefault(tid, []).append(bare)
        old_order = [t for _r, _c, t in old.execute("select row, col, topic_id from path order by row, col")]
        old.close()
        vid_of = {u: v for u, _, _, v in route if v}
        known = set()
        for t in old_order:
            known |= set(old_words.get(t, []))
            if t in vid_of:
                before[t] = followable(vid_of[t], known)

    taught, units = set(), []
    for tid, kind, k, vid in route:
        size = ((SPINE_UNIT if k < EARLY_SPINE else SPINE_UNIT_LATER) if kind == "spine"
                else (BRANCH_SIZE_EARLY if k < EARLY_CHAPTERS else BRANCH_SIZE))
        chosen, why = [], {}
        curated_keep = set((UNIT_WORDS.get(tid) or {}).get("keep", []))
        curated_drop = set((UNIT_WORDS.get(tid) or {}).get("drop", []))

        def take(lid, reason):
            if lid in taught or lid in why or lid not in dedup_set:
                return False
            if reserved.get(lid, tid) != tid:
                return False
            if reason == "video" and meta[lid]["bare"] in VIDEO_NOISE:
                return False
            # A side quest takes a video word that is off its topic only when
            # the word is common. The owner, 2026-09-30: "When in doubt, stick
            # to the most useful/common words. Build towards the videos… They
            # don't need to know every single word." Built from the video
            # alone, Sport taught «автомат» and «трагический», Animals
            # «банкомат», Faith «скидка» — words an episode happened to say,
            # rare and off the subject. A common one («кофе», «война») still
            # earns its place: it helps with the video and with everything else.
            bare = meta[lid]["bare"]
            if bare in curated_drop:
                return False
            offtopic = (reason == "video" and kind == "branch" and topic_of.get(lid) != tid
                        and bare not in curated_keep)
            if offtopic and spoken.get(bare, 10 ** 6) > OFFTOPIC_RANK:
                return False
            # …and only a share of the quest. Uncapped, a quest filled its video
            # room with whatever common words its episode said, and each word a
            # review dropped only drifted to the next quest («блин» from
            # Emotion to Body, «салат» to Faith). The common words fall to the
            # spine, which takes the commonest words anyway.
            if offtopic and sum(1 for l in chosen if why.get(l) == "video" and topic_of.get(l) != tid
                                and meta[l]["bare"] not in curated_keep) >= round(size * OFFTOPIC_SHARE):
                return False
            if kind == "branch" and meta[lid]["pos"] not in BRANCH_POS:
                return False     # the closed classes are the spine's to teach
            chosen.append(lid)
            why[lid] = reason
            return True

        # Not every slot goes to the video. A side quest keeps a share for its
        # topic's core words and the spine for the commonest words there are:
        # built from the video alone, Sport taught no «футбол», Family no «брат»
        # and Medicine no «больница», because those particular episodes happen
        # not to say them — and a unit on a subject without its first word is
        # not a unit on that subject.
        video_room = size - round(size * (SPINE_RESERVE if kind == "spine" else BRANCH_RESERVE))
        # A reader's keeps first (data/curated/unit_words.json): the frequency
        # rule cannot tell «праздновать» in an Easter episode from «скидка» in
        # the same one, and the chapter reviews can.
        for bare in (UNIT_WORDS.get(tid) or {}).get("keep", []):
            for lid in by_bare.get(bare, [])[:1]:
                take(lid, "curated")
        if vid:
            c = counts.get(vid) or {}
            total = sum(c.values()) or 1
            got = sum(n for b, n in c.items() if any(l in taught for l in by_bare.get(b, [])))
            for b, n in sorted(c.items(), key=lambda x: (-x[1], spoken.get(x[0], 10 ** 6))):
                if got >= COVER * total or len(chosen) >= video_room:
                    break
                for lid in by_bare.get(b, [])[:1]:
                    if take(lid, "video"):
                        got += n
        if kind == "spine":
            for lid in sorted(forced, key=lambda l: spoken.get(meta[l]["bare"], 10 ** 6)):
                if len(chosen) >= size:
                    break
                take(lid, "common")
            for lid in sorted(deduped, key=lambda l: spoken.get(meta[l]["bare"], 10 ** 6)):
                if len(chosen) >= size:
                    break
                take(lid, "common")
            # Enough verbs to make a sentence with (SPINE_VERBS): swap the last
            # top-ups for the video's most-said verbs, then the commonest.
            verbs = [l for l in chosen if meta[l]["pos"] == "verb"]
            if len(verbs) < SPINE_VERBS:
                pool_v = [by_bare[b][0] for b, _ in sorted((counts.get(vid) or {}).items(), key=lambda x: -x[1])
                          if b in by_bare] + sorted(deduped, key=lambda l: spoken.get(meta[l]["bare"], 10 ** 6))
                for lid in pool_v:
                    if len(verbs) >= SPINE_VERBS:
                        break
                    if meta[lid]["pos"] != "verb" or lid in taught or lid in why or lid not in dedup_set:
                        continue
                    drop = next((l for l in reversed(chosen) if meta[l]["pos"] != "verb"
                                 and why[l] not in ("video", "curated")), None)
                    if drop is None:
                        break
                    chosen.remove(drop)
                    del why[drop]
                    chosen.append(lid)
                    why[lid] = "verb"
                    verbs.append(lid)
        else:
            for lid, _n, _hit in by_topic.get(tid, []):
                if len(chosen) >= size:
                    break
                take(lid, "topic")
        # Lessons are cut from this order, so the commonest words come first:
        # «я» and «быть» belong in chapter 1's first lesson whatever the video
        # happens to repeat most.
        chosen.sort(key=lambda l: spoken.get(meta[l]["bare"], 10 ** 6))
        # …and then by group (data/curated/word_groups.json, the owner,
        # 2026-09-30: "Related words always need to be together throughout
        # the entire app"). A group is taught whole and in its own order —
        # the four seasons in one lesson, winter to autumn — and the groups
        # come in the order of their commonest word, so the first lesson is
        # still the commonest words there are, just in the company they keep.
        chosen, group_of = grouped(tid, chosen, meta, spoken, lesson_size(k))
        taught |= set(chosen)
        after = followable(vid, {meta[l]["bare"] for l in taught}) if vid else None
        units.append({"id": tid, "kind": kind, "chapter": k, "video": vid, "words": chosen,
                      "why": why, "group": group_of, "after": after, "before": before.get(tid)})

    if args.out.exists():
        args.out.unlink()
    db = sqlite3.connect(args.out)
    db.executescript(SCHEMA)

    ordv, row = 0, 0
    name_of = {t: n for t, n, _ in rules}
    for u in units:
        k = u["chapter"]
        if u["kind"] == "spine":
            spine_name, chapter_title = CHAPTERS[k] if k < len(CHAPTERS) else (f"More Words {k + 1}", f"Chapter {k + 1}")
            db.execute("insert into topics (id, name, kind, ord, n) values (?,?,?,?,?)",
                       (u["id"], spine_name, "spine", ordv, len(u["words"])))
            db.execute("insert into chapters (n, title, spine_id) values (?,?,?)", (k + 1, chapter_title, u["id"]))
            db.execute("insert into path (row, col, topic_id, requires) values (?,?,?,?)",
                       (row, 0, u["id"], f"core{k}" if k else None))
            quest_k = 0
        else:
            if len(u["words"]) < BRANCH_MIN:
                print(f"  !! {u['id']}: {len(u['words'])} words, below {BRANCH_MIN}; left out")
                continue
            db.execute("insert into topics (id, name, kind, ord, n, opt) values (?,?,?,?,?,?)",
                       (u["id"], name_of[u["id"]], "branch", ordv, len(u["words"]),
                        1 if u["id"] in OPTIONAL else 0))
            db.execute("insert into path (row, col, topic_id, requires) values (?,?,?,?)",
                       (row, -1 if quest_k % 2 == 0 else 1, u["id"], f"core{k + 1}"))
            quest_k += 1
        db.executemany("insert into unit_words (topic_id, lemma_id, ord, reason, grp, gkind, gord) "
                       "values (?,?,?,?,?,?,?)",
                       [(u["id"], lid, j, u["why"][lid]) + u["group"].get(lid, (None, None, None))
                        for j, lid in enumerate(u["words"])])
        ordv += 1
        row += 1

    db.commit()

    print(f"wrote {args.out}")
    print(f"  pool considered   : {len(meta):,} lemmas with glosses "
          f"({unsettled:,} tokens of forms the resolver could not settle counted for nobody)")
    print(f"  duplicate forms   : {dropped:,} rows dropped (one row per bare form; names out)")
    print(f"  words taught      : {len(taught):,} "
          f"({sum(1 for u in units for l in u['words'] if u['why'][l] == 'video'):,} chosen off a video)")
    opt_n = sum(1 for u in units if u["kind"] == "branch" and u["id"] in OPTIONAL)
    print(f"  units             : {sum(1 for u in units if u['kind'] == 'spine')} spine, "
          f"{sum(1 for u in units if u['kind'] == 'branch')} branch ({opt_n} optional)")
    if UNGROUPED:
        print(f"    !! {len(UNGROUPED)} word(s) in no group — run node tools/build_word_groups.mjs --stale: "
              + ", ".join(f"{t}:{b}" for t, b in UNGROUPED[:12]) + (" …" if len(UNGROUPED) > 12 else ""))
    if MISKINDED:
        print(f"    !! {len(MISKINDED)} word(s) in a section their class does not belong in (word_groups.json): "
              + ", ".join(f"{t}:{b}→{s}" for t, b, s in MISKINDED[:12]) + (" …" if len(MISKINDED) > 12 else ""))
    if SPLIT_GROUPS:
        print(f"    {len(SPLIT_GROUPS)} group(s) a lesson boundary cuts (larger than a lesson, or no clean packing): "
              + ", ".join(f"{t}:{g}" for t, g in SPLIT_GROUPS[:12]) + (" …" if len(SPLIT_GROUPS) > 12 else ""))
    # A reader's decision that did not take effect is reported, never dropped:
    # a keep the build could not honour is a keep the reader thinks is there.
    unit_of = {meta[l]["bare"]: u["id"] for u in units for l in u["words"]}
    in_unit = {u["id"]: {meta[l]["bare"] for l in u["words"]} for u in units}
    place = {u["id"]: n for n, u in enumerate(units)}
    missed, earlier = [], []
    for tid, v in UNIT_WORDS.items():
        if not isinstance(v, dict) or tid not in in_unit:
            continue
        for b in v.get("keep", []):
            if b in in_unit[tid]:
                continue
            if b not in by_bare:
                missed.append(f"{tid}:{b} (not in the lexicon)")
            elif b in unit_of and place[unit_of[b]] < place[tid]:
                earlier.append(f"{tid}:{b} ({unit_of[b]})")   # the rule: an earlier unit wins
            elif b in unit_of:
                missed.append(f"{tid}:{b} (taught later, in {unit_of[b]})")
            elif meta[by_bare[b][0]]["pos"] not in BRANCH_POS and not tid.startswith("core"):
                missed.append(f"{tid}:{b} ({meta[by_bare[b][0]]['pos']} — the spine's to teach)")
            else:
                missed.append(f"{tid}:{b} (unit full)")
        missed += [f"{tid}:{b} (dropped, still taught)" for b in v.get("drop", []) if b in in_unit[tid]]
    # A keep that names a form of another word rather than a headword: its
    # sentences are all credited to that other word, so it is taught with none
    # («лыжи», a form of «лыжа»). A keep the decks simply never say is fine —
    # Tatoeba supplies its examples — so that is not what this checks.
    forms_of = []
    for l in reserved:
        owner = resolver.owner_id(fold(meta[l]["bare"]))
        # An unsettled owner (None) is the same failure: no sentence is credited
        # to the keep either way — «лыжи» itself resolved to nobody.
        if l in taught and owner != l:
            other = src.execute("select bare from lemmas where id=?", (owner,)).fetchone() if owner else None
            forms_of.append(f"«{meta[l]['bare']}» is a form of «{other[0]}»" if other
                            else f"«{meta[l]['bare']}» is a form no one word owns")
    if forms_of:
        print(f"    !! {len(forms_of)} curated keep(s) name a form, not the headword: " + ", ".join(forms_of))
    if missed:
        print(f"    !! {len(missed)} curated keep/drop(s) did not take: " + ", ".join(missed))
    if earlier:
        print(f"    {len(earlier)} curated keep(s) already taught on the way: " + ", ".join(earlier))
    stale = sorted(OPTIONAL - {u["id"] for u in units})
    if stale:
        print(f"    !! OPTIONAL names {len(stale)} unit(s) that do not exist: " + ", ".join(stale))
    print()
    print("  how much of its video a learner follows by the unit's end (was → now):")
    for u in units:
        was = f"{u['before']:.0%}" if u["before"] is not None else "  —"
        now = f"{u['after']:.0%}" if u["after"] is not None else "no video"
        vids = sum(1 for l in u["words"] if u["why"][l] == "video")
        print(f"    ch{u['chapter'] + 1:>2} {u['id']:<9} {len(u['words']):>3} words ({vids:>2} off the video)  {was:>4} → {now}")
    db.close()


if __name__ == "__main__":
    main()
