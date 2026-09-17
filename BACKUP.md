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
| YouTube auto-subtitles | `data/raw/subs/` | ~60 MB, 321 videos | Slowly and unreliably — `harvest_videos.py` pulls them with yt-dlp, one request a second, and YouTube rate-limits or blocks (75 of 396 videos had none). Treat as hard to regenerate. |
| YouTube metadata | `data/raw/youtube/meta/` + `catalogue.json` | ~30 MB, 395 files | Same tool, same caveat; the catalogue is rebuilt from the cache with `--no-fetch`. |
| Easy Russian episode list | `data/raw/youtube/easyrussian.tsv` | small | Hand-curated input; merged into the harvest so the unit videos never depend on today's network. Channels themselves are curated in `data/curated/channels.json` (tracked). |
| Tatoeba dumps + audio | `data/raw/tatoeba/` | 53.4 MB | Dumps re-download in minutes (`ingest_tatoeba.py` fetches them). The 185 recordings were fetched one by one with a pause; `ATTRIBUTION.txt` beside them is a licence record. |
| Wiktionary extract | `data/raw/wiktionary/russian.jsonl` | 895 MB | Yes, from kaikki.org — but it is nearly a gigabyte over the wire, so back it up rather than re-fetch it (§30q). |
| **The bought scenario audio** | `data/scenario_audio/` (**tracked**, 22.6 MB) | 2,213 clips | **No — it was paid for.** $1.49 of Google Chirp3-HD, keyed by voice and text, and re-buying is the only way back. In git deliberately, unlike everything else generated here. |
| **The Android signing key** | `native/android/app/debug.keystore` | 2,257 bytes | **No.** It is what every local build on his phone is signed with, and Android will not let a differently-signed APK update one already installed — the only way through is to uninstall, which erases the learner's progress (§31). Losing it therefore costs a month of study, not a rebuild. Gitignored along with the rest of `native/android/`, so git is not the copy. Second copy at `C:\Users\jared\OneDrive\BridgesBackup\keystore\debug.keystore`, taken 2026-09-16, SHA-256 `221E0A3106AA4C3CCC154E0A418B55020B3F9EA6E84F92E8749CD9E2F39F5E58` — compare that before trusting a restored one. |

## Generated — regenerable, kept for convenience

| What | Built by | Size | Time to rebuild |
|---|---|---|---|
| `data/corpus.db` | `ingest_anki.py` | 30.2 MB | ~1 min |
| `data/lexicon.db` | `build_lexicon.py` | 149.6 MB | ~2 min |
| `data/examples.db` | `ingest_tatoeba.py` | 5.4 MB | ~1 min once dumps are present |
| `data/topics.db` | `build_topics.py` | 0.1 MB | seconds; content-identical on rebuild, bytes differ at the SQLite page level |
| `data/audio.json` | `build_audio.py` | 0.9 MB | ~1 min; deterministic from the media dir (13,183 utterances) |
| `data/transcripts.json` | `build_transcripts.py` | 55 MB | minutes, **if** `data/raw/subs/` and the catalogue are present |
| `data/videos.json` (tracked) | `build_videos.py` | 0.4 MB | seconds |
| `site/` incl. `site/audio/` | `build_site.py`, `build_audio.py` | 15.6 MB page + 208.8 MB audio | ~1 min each, from the databases and the media dir |
| `native/assets/data.json` | `build_site.py` | 15.5 MB | with the page |
| `native/assets/{deep,sent,videos,listening,senses}.json` | `build_site.py` | 12.3 MB | with the page. All six parts are gitignored as of 2026-09-11 — two of them were tracked and four were not, which is how a clone builds differently from the machine that made it |
| `data/senses.db` | `ingest_wiktionary.py` | 11.6 MB | ~2 min, **from the 895 MB extract above** |
| `native/assets/scenes/` + `native/src/scenetracks.js` | `build_scene_tracks.mjs` | 27.5 MB | seconds, with ffmpeg, from the bought clips |

Full rebuild order, from sources only:
`ingest_anki → build_lexicon → ingest_tatoeba → build_topics → build_audio → build_site`.

## Second copy

Location: `C:\Users\jared\OneDrive\BridgesBackup\2026-09-07\` (the 2026-09-05 copy
beside it can be deleted once this one shows as synced).

Contents: the live Anki media directory, the collection snapshot from `data/_work/`,
all of `data/raw/` (now with the six new channels' captions and metadata),
`data/transcripts.json`, and `site/audio/`.

Verified 2026-09-07 02:13 after the copy: **37,790 files, 927.7 MB** (robocopy,
0 failures). The 2026-09-05 copy was 37,309 files, 670.5 MB.

**Whether OneDrive is actually syncing that folder to the cloud cannot be verified from
a shell.** Check the OneDrive tray icon shows it as synced before trusting it as
off-machine. Drives D:, E: and H: on this machine also have >1 TB free each; whether
they are separate physical disks from C: is not known.

Refresh the copy after any Anki sync that brings new media across, and after
`harvest_videos.py` fetches new captions or metadata.

**The code has a second copy since 2026-09-15**: `git@github.com:DeepChrome/bridges.git`,
private, reached through the Windows ssh-agent (CLAUDE.md §30u). Everything git tracks
is recoverable from there. What is *not* recoverable from there is everything in the
two tables above — and the signing key, which is why it now has a row of its own.
