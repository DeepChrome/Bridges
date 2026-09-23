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
import re
import sqlite3
import sys
import io
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from panel import fold, Resolver, STUB_GLOSS  # noqa: E402  (fold: the fr lookup)

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent

SPINE_UNIT = 30      # words per core unit
SPINE_UNITS = 10     # core units: ten chapters (eight left chapter 8 a 44-lesson dump)
SPINE_VERBS = 5      # verbs a spine unit carries at least — chapter 1 had one (быть)
SPINE_FR = 200       # this common in the Core-5000 ranking: spine, whatever the decks say
CLOSED_TOP = 500     # closed-class words this common are spine: no branch can take them
CLOSED = {"other", "pronoun", "possessive", "numeral"}
BRANCH_MAX = 40      # cap on a topic unit…
BRANCH_MAX_EARLY = 20  # …and in the first chapters, where forty nouns is a word bank
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

# A chapter is one spine unit plus the branches that follow it — the shape a language
# textbook already has: a core of words you cannot speak without, then the themed
# vocabulary that builds on them. Aligned index-for-index with STAGE_PLAN below.
#
# The chapter title names what the chapter collectively covers, taken from its
# branches. The spine name *describes* what is actually in that frequency band — it
# does not define it. The spine is ordered by how often a word occurs in the decks,
# so these names were written by reading the word lists, not by deciding in advance
# what each unit ought to contain. Re-read them if --pool changes: the bands shift.
CHAPTERS = [
    ("Pronouns & Being",       "People and Time"),
    ("Time, Life & People",    "Food and School"),
    ("Wanting & Knowing",      "Home and Clothes"),
    ("Everyday Things",        "Town and Travel"),
    ("Family & Home Life",     "Health and Nature"),
    ("Health & Getting Around", "Work and Animals"),
    ("Days, Talk & the World", "Mind and Language"),
    ("Things & Happenings",    "Conflict, Tech and Sport"),
    ("Where, When & How",      "Culture and Society"),
    ("Thought & Society",      "Law and Faith"),
]

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
  reason   text                  -- which rule placed it, for auditing
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

    # The spine is decided first, and its words are then off-limits to the branches:
    # a core word is taught once, on the spine, not again inside a topic.
    #
    # What the spine holds (the pedagogy review, 2026-09-08): the commonest words
    # by the decks' own count, plus three kinds of word the count alone put in
    # the wrong place or nowhere — closed-class words in the top CLOSED_TOP (да,
    # если, или, два: no topic rule can take them, so 210 of the 463 commonest
    # were taught nowhere), words the Core-5000 ranking puts in the top SPINE_FR
    # (понимать is #85 there and was a side-quest word), and enough verbs per
    # unit to make a sentence with (SPINE_VERBS; chapter 1 taught one verb).
    fr = {}
    for rk, f in src.execute("select ru_key, freq_rank from c.items"
                             " where kind='vocab' and freq_rank is not null"):
        fr.setdefault(rk, f)
    total = SPINE_UNIT * SPINE_UNITS
    forced = set()
    for k, lid in enumerate(deduped):
        m = meta[lid]
        if (m["pos"] in CLOSED and k < CLOSED_TOP) or fr.get(fold(m["bare"]), 10 ** 9) <= SPINE_FR:
            forced.add(lid)
    rest = [lid for lid in deduped if lid not in forced]
    spine_pool = sorted(list(forced) + rest[:max(0, total - len(forced))], key=deduped.index)
    # Cut into units by frequency, each with its quota of verbs: a unit short of
    # verbs pulls the next ones forward and gives up its least common other words
    # to the unit after.
    spine_chunks, used = [], set()
    for n in range(SPINE_UNITS):
        free = [lid for lid in spine_pool if lid not in used]
        chunk = free[:SPINE_UNIT]
        verbs_in = [lid for lid in chunk if meta[lid]["pos"] == "verb"]
        if len(verbs_in) < SPINE_VERBS:
            extra = [lid for lid in free[SPINE_UNIT:] if meta[lid]["pos"] == "verb"][:SPINE_VERBS - len(verbs_in)]
            drop = [lid for lid in chunk if meta[lid]["pos"] != "verb"][::-1][:len(extra)]
            chunk = [lid for lid in chunk if lid not in drop] + extra
            chunk.sort(key=spine_pool.index)
        used.update(chunk)
        spine_chunks.append(chunk)
    spine_set = set(used)
    dedup_set = set(deduped)

    rules = compile_rules()
    assigned, by_topic = {}, {t: [] for t, _, _ in rules}
    by_bare = {}
    for lid in deduped:
        by_bare.setdefault(meta[lid]["bare"], []).append(lid)

    # A topic's own verbs first (BRANCH_VERBS), unless the spine has them.
    for tid, verbs in BRANCH_VERBS.items():
        if tid not in by_topic:
            continue
        for bare in verbs:
            for lid in by_bare.get(bare, []):
                if meta[lid]["pos"] == "verb" and lid not in spine_set and lid not in assigned:
                    assigned[lid] = tid
                    by_topic[tid].append((lid, meta[lid]["n"], "verb"))
                    break

    for lid, m in meta.items():
        if lid in spine_set or lid not in dedup_set or m["pos"] not in BRANCHABLE or lid in assigned:
            continue
        if m["bare"] in OVERRIDES:
            tid = OVERRIDES[m["bare"]]
            if tid:
                assigned[lid] = tid
                by_topic[tid].append((lid, m["n"], "manual"))
            continue
        # Parentheticals are disambiguators, not meanings: "on (date)" must not
        # make на a word about time. Only the PRIMARY senses count — the first
        # two, and each at most three words — because a word is what it mostly
        # means: стекло is "glass" the material before it is a drinking glass,
        # зеркало is a mirror, таблица is a chart. Matching any sense anywhere
        # put all three in Food, глухой ("deaf"; also "blind wall") in Home, and
        # a fifth of every branch was that kind of accident.
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
                assigned[lid] = tid
                by_topic[tid].append((lid, m["n"], hit))
                break

    if args.out.exists():
        args.out.unlink()
    db = sqlite3.connect(args.out)
    db.executescript(SCHEMA)

    ordv = 0
    spine_ids = []

    # --- spine: the commonest words, whatever they are about --------------
    for i, chunk in enumerate(spine_chunks):
        if len(chunk) < SPINE_UNIT // 2:
            break
        n = i + 1
        tid = f"core{n}"
        # Past the curated list the bands are unnamed rather than numbered — a wrong
        # name is worse than none, and this only happens if --pool grows.
        spine_name, chapter_title = (CHAPTERS[n - 1] if n <= len(CHAPTERS)
                                     else (f"More Words {n}", f"Chapter {n}"))
        db.execute("insert into topics (id, name, kind, ord, n) values (?,?,?,?,?)",
                   (tid, spine_name, "spine", ordv, len(chunk)))
        db.execute("insert into chapters (n, title, spine_id) values (?,?,?)",
                   (n, chapter_title, tid))
        db.executemany(
            "insert into unit_words (topic_id, lemma_id, ord, reason) values (?,?,?,?)",
            [(tid, lid, j, "frequency") for j, lid in enumerate(chunk)])
        spine_ids.append(tid)
        ordv += 1

    # --- lay out the tree --------------------------------------------------
    # Concrete, immediately useful topics come early; abstract and specialist
    # ones come late. Anything not named here lands in the final stage.
    #
    # The order is also the grammar order (docs/grammar-sequence.md): each
    # chapter's spine note introduces one point, and a branch's note may only use
    # what has been introduced by then. Chapter 2 teaches the present tense, so it
    # gets the two branches whose notes are about verbs (food: есть/пить, school:
    # учить/учиться); chapter 3 teaches gender, so home and clothes (agreement);
    # chapter 6 teaches the accusative, so work (having/not having: the first
    # genitive) then animals (animate accusative copies the genitive); chapter 8
    # opens on military, which introduces the instrumental that tech then uses.
    # Side quests sit with the chapter whose grammar they can use: business with
    # work (the genitive of having), science and law with the instrumental
    # chapter, faith with art and society. Ten chapters since 2026-09-08: the
    # eighth used to carry eight quests and 44 lessons.
    STAGE_PLAN = [
        ["family", "time"],
        ["food", "school"],
        ["home", "clothes"],
        ["city", "travel"],
        ["body", "nature", "medicine"],
        ["work", "animals"],
        ["emotion", "speech", "business"],
        ["military", "tech", "sport"],
        ["art", "politics", "science"],
        ["law", "religion"],
    ]
    chapter_of = {b: k for k, stage in enumerate(STAGE_PLAN) for b in stage}

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

    # --- branches: topic units --------------------------------------------
    # Capped, and capped harder in the first chapters: forty nouns of family
    # eight lessons deep is a word bank, not a lesson. A topic's own verbs
    # (BRANCH_VERBS) are kept ahead of the cap.
    branch_ids = []
    for tid, name, _ in rules:
        cap = BRANCH_MAX_EARLY if chapter_of.get(tid, 99) < EARLY_CHAPTERS else BRANCH_MAX
        verbs = [w for w in by_topic[tid] if w[2] == "verb"]
        others = sorted([w for w in by_topic[tid] if w[2] != "verb"], key=lambda x: -x[1])
        words = verbs + others[:max(0, cap - len(verbs))]
        if len(words) < BRANCH_MIN:
            continue
        db.execute("insert into topics (id, name, kind, ord, n, opt) values (?,?,?,?,?,?)",
                   (tid, name, "branch", ordv, len(words), 1 if tid in OPTIONAL else 0))
        db.executemany(
            "insert into unit_words (topic_id, lemma_id, ord, reason) values (?,?,?,?)",
            [(tid, lid, j, why) for j, (lid, _, why) in enumerate(words)])
        branch_ids.append(tid)
        ordv += 1

    have = set(branch_ids)
    planned = [b for stage in STAGE_PLAN for b in stage if b in have]
    leftover = [b for b in branch_ids if b not in planned]

    row = 0
    for si, sid in enumerate(spine_ids):
        db.execute("insert into path (row, col, topic_id, requires) values (?,?,?,?)",
                   (row, 0, sid, spine_ids[si - 1] if si else None))
        row += 1
        stage = [b for b in (STAGE_PLAN[si] if si < len(STAGE_PLAN) else []) if b in have]
        if si == len(spine_ids) - 1:
            stage = stage + leftover
        for k, bid in enumerate(stage):
            db.execute("insert into path (row, col, topic_id, requires) values (?,?,?,?)",
                       (row, -1 if k % 2 == 0 else 1, bid, sid))
            row += 1

    db.commit()

    print(f"wrote {args.out}")
    print(f"  pool considered   : {len(meta):,} lemmas with glosses "
          f"({unsettled:,} tokens of forms the resolver could not settle counted for nobody)")
    print(f"  duplicate forms   : {dropped:,} rows dropped (one row per bare form; names out)")
    print(f"  placed in a topic : {len(assigned):,} ({len(assigned)/max(1,len(meta)):.0%})")
    print(f"  spine units       : {len(spine_ids)}")
    opt_n = sum(1 for b in branch_ids if b in OPTIONAL)
    print(f"  branch units      : {len(branch_ids)} "
          f"({len(branch_ids) - opt_n} the chapter requires, {opt_n} optional)")
    stale = sorted(OPTIONAL - set(branch_ids))
    if stale:
        print(f"    !! OPTIONAL names {len(stale)} unit(s) that do not exist: " + ", ".join(stale))
    print()
    for tid, name, kind, n, opt in db.execute(
            "select id, name, kind, n, opt from topics order by kind, ord"):
        print(f"    {kind:<7} {name:<22} {n:>3}{'  optional' if opt else ''}")
    db.close()


if __name__ == "__main__":
    main()
