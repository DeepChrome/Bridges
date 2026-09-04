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
from panel import fold  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent

SPINE_UNIT = 28      # words per core unit
BRANCH_MAX = 40      # cap on a topic unit
BRANCH_MIN = 10      # below this a topic isn't worth a unit

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
        shop store market bank post office hospital school library museum theatre
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
        lawyer nurse driver farmer builder salary wage pay money cash coin rouble
        ruble dollar price cost expensive cheap buy sell trade business company
        firm market economy bank credit debt tax profit rich poor pension
        contract meeting colleague retire hire fire""".split()),

    ("school",     "School & Learning", """school university college class lesson
        student pupil teacher professor study learn teach read write book notebook
        pen pencil paper exam test grade mark homework subject mathematics physics
        chemistry biology history geography language grammar word dictionary
        library knowledge education degree diploma course lecture question answer
        example rule mistake""".split()),

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

    ("politics",   "Politics & Society","""state government president minister
        parliament election vote party politics political power law legal court
        judge police prison crime criminal thief steal murder trial lawyer
        constitution right freedom citizen nation nationality republic democracy
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
        electricity battery wire signal network system technology invention
        science scientist research experiment laboratory""".split()),

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

# Ambiguous glosses the rules get wrong, resolved by hand. None = leave unplaced.
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
    ("Time, Life & People",    "Home and Table"),
    ("Wanting & Knowing",      "Town and Travel"),
    ("Everyday Things",        "Body and Appearance"),
    ("Family & Home Life",     "School and Work"),
    ("Health & Getting Around", "Nature and Animals"),
    ("Days, Talk & the World", "Mind and Language"),
    ("Thought & Society",      "Culture and Society"),
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
  n      integer not null default 0
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
    pool = src.execute("""
        select f.lemma_id, count(*) n from c.item_tokens t
        join forms f on f.key = t.key
        group by f.lemma_id order by n desc limit ?
    """, (args.pool,)).fetchall()

    meta = {}
    for lid, n in pool:
        row = src.execute(
            "select bare, accented, pos, en from lemmas where id=?", (lid,)).fetchone()
        if row and row[3]:
            meta[lid] = {"bare": row[0], "acc": row[1], "pos": row[2],
                         "en": row[3], "n": n}

    # The spine is decided first, and its words are then off-limits to the branches:
    # a core word is taught once, on the spine, not again inside a topic.
    spine_pool = [lid for lid, _ in pool if lid in meta][:SPINE_UNIT * 8]
    spine_set = set(spine_pool)

    rules = compile_rules()
    assigned, by_topic = {}, {t: [] for t, _, _ in rules}

    for lid, m in meta.items():
        if lid in spine_set or m["pos"] not in BRANCHABLE:
            continue
        if m["bare"] in OVERRIDES:
            tid = OVERRIDES[m["bare"]]
            if tid:
                assigned[lid] = tid
                by_topic[tid].append((lid, m["n"], "manual"))
            continue
        # Parentheticals are disambiguators, not meanings: "on (date)" must not
        # make на a word about time.
        senses = [PARENS.sub(" ", s).strip()
                  for s in re.split(r"[,;]", m["en"].lower())]
        for tid, _, pat in rules:
            hit = next((s for s in senses if pat.search(s)), None)
            if hit and len(hit) <= 40:
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
    for i in range(0, len(spine_pool), SPINE_UNIT):
        chunk = spine_pool[i:i + SPINE_UNIT]
        if len(chunk) < SPINE_UNIT // 2:
            break
        n = i // SPINE_UNIT + 1
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

    # --- branches: topic units --------------------------------------------
    branch_ids = []
    for tid, name, _ in rules:
        words = sorted(by_topic[tid], key=lambda x: -x[1])[:BRANCH_MAX]
        if len(words) < BRANCH_MIN:
            continue
        db.execute("insert into topics (id, name, kind, ord, n) values (?,?,?,?,?)",
                   (tid, name, "branch", ordv, len(words)))
        db.executemany(
            "insert into unit_words (topic_id, lemma_id, ord, reason) values (?,?,?,?)",
            [(tid, lid, j, why) for j, (lid, _, why) in enumerate(words)])
        branch_ids.append(tid)
        ordv += 1

    # --- lay out the tree --------------------------------------------------
    # Concrete, immediately useful topics come early; abstract and specialist
    # ones come late. Anything not named here lands in the final stage.
    STAGE_PLAN = [
        ["family", "time"],
        ["food", "home"],
        ["city", "travel"],
        ["body", "clothes"],
        ["school", "work"],
        ["nature", "animals"],
        ["emotion", "speech"],
        ["sport", "art", "tech", "politics", "military"],
    ]
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
    print(f"  pool considered   : {len(meta):,} lemmas with glosses")
    print(f"  placed in a topic : {len(assigned):,} ({len(assigned)/max(1,len(meta)):.0%})")
    print(f"  spine units       : {len(spine_ids)}")
    print(f"  branch units      : {len(branch_ids)}\n")
    for tid, name, kind, n in db.execute(
            "select id, name, kind, n from topics order by kind, ord"):
        print(f"    {kind:<7} {name:<22} {n:>3}")
    db.close()


if __name__ == "__main__":
    main()
