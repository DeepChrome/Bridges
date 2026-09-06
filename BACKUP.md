# What is not in git, and where it lives

Everything git tracks is recoverable from the remote (once P0.1 gives it one). This
file is about the rest: the inputs the pipeline reads and the artifacts it writes,
which are gitignored because they are large, generated, or both. Sizes measured
2026-09-05.

## Sources — not regenerable by this repo

These are the things the pipeline *consumes*. Lose them and no tool here brings them
back.

| What | Where | Size | Regenerable? |
|---|---|---|---|
| **Anki collection** (live) | `%APPDATA%\Anki2\User 1\collection.anki2` | 22.8 MB | Syncs from AnkiWeb, and the phone (AnkiDroid) is the source of truth. **Never written to by this repo** — rule 20.1. |
| **Anki media** (live) | `%APPDATA%\Anki2\User 1\collection.media\` | 23,587 files, 292.0 MB (23,546 mp3) | Partly. Media syncs separately from cards and lags; CLAUDE.md records recordings still unsynced from the phone. **This is the real audio asset** — `site/audio/` is derived from it. |
| Collection snapshot | `data/_work/collection.anki2` (+ `-wal`, `-shm`) | 26.4 MB | Yes — `ingest_anki.py` copies the live collection here on every run. Kept in the backup as a consistent point-in-time copy. |
| OpenRussian dump | `data/raw/openrussian/` | 21.7 MB | Yes, in minutes — github.com/Badestrand/russian-dictionary. Backed up anyway so the exact dump version is reproducible. |
| YouTube auto-subtitles | `data/raw/subs/` | 26.7 MB | Slowly and unreliably — `build_transcripts.py` pulls them with yt-dlp, 152 videos with a 0.6 s pause, and YouTube rate-limits or blocks. Treat as hard to regenerate. |
| Easy Russian episode list | `data/raw/youtube/easyrussian.tsv` | small | Hand-curated input. |
| Tatoeba dumps + audio | `data/raw/tatoeba/` | 53.4 MB | Dumps re-download in minutes (`ingest_tatoeba.py` fetches them). The 185 recordings were fetched one by one with a pause; `ATTRIBUTION.txt` beside them is a licence record. |

## Generated — regenerable, kept for convenience

| What | Built by | Size | Time to rebuild |
|---|---|---|---|
| `data/corpus.db` | `ingest_anki.py` | 30.2 MB | ~1 min |
| `data/lexicon.db` | `build_lexicon.py` | 149.6 MB | ~2 min |
| `data/examples.db` | `ingest_tatoeba.py` | 5.4 MB | ~1 min once dumps are present |
| `data/topics.db` | `build_topics.py` | 0.1 MB | seconds; content-identical on rebuild, bytes differ at the SQLite page level |
| `data/audio.json` | `build_audio.py` | 0.9 MB | ~1 min; deterministic from the media dir (13,183 utterances) |
| `data/transcripts.json` | `build_transcripts.py` | 41.5 MB | minutes, **if** `data/raw/subs/` is present |
| `site/` incl. `site/audio/` | `build_site.py`, `build_audio.py` | 12.6 MB page + 208.8 MB audio | ~1 min each, from the databases and the media dir |
| `native/assets/data.json` | `build_site.py` | 12.43 MB | with the page |

Full rebuild order, from sources only:
`ingest_anki → build_lexicon → ingest_tatoeba → build_topics → build_audio → build_site`.

## Second copy

Location: `C:\Users\jared\OneDrive\BridgesBackup\2026-09-05\`

Contents: the live Anki media directory, the collection snapshot from `data/_work/`,
all of `data/raw/`, `data/transcripts.json`, and `site/audio/`.

Verified 2026-09-05 23:03 after the copy: **37,309 files, 670.5 MB**; the media
directory copied 291.96 MB with 0 failures (robocopy).

**Whether OneDrive is actually syncing that folder to the cloud cannot be verified from
a shell.** Check the OneDrive tray icon shows it as synced before trusting it as
off-machine. Drives D:, E: and H: on this machine also have >1 TB free each; whether
they are separate physical disks from C: is not known.

Refresh the copy after any Anki sync that brings new media across, and after
`build_transcripts.py` fetches new subtitles.
