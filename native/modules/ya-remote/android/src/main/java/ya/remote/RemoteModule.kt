/* The media keys of a headset, a car or a Bluetooth remote, handed to
 * JavaScript (CLAUDE.md 30cy).
 *
 * Android gives a media key to one app: the one whose MediaSession played
 * most recently. So the screen that wants the keys holds a session while it
 * is up. The session here sits over a `StubPlayer` that makes no sound — a
 * player of expo-audio's would hold the audio route and silence the YouTube
 * WebView (30h′) — and only reports a state (playing or paused, a title) so
 * the platform treats it as the current player. Every key reaches the
 * session's callback as a KeyEvent and goes out to JavaScript as a
 * `remoteKey` event; nothing is acted on here. A controller that sends
 * transport commands rather than keys (a car head unit through the session's
 * controls) lands in the stub player's handlers and goes out the same way.
 *
 * expo-audio's own sessions — the drive's silent carrier, and every word clip
 * — would otherwise swallow a key pressed while one of them is playing. The
 * patch tools/patch_expo_audio.mjs applies has them broadcast the KeyEvent
 * to this app instead (ACTION, below), and the receiver here turns it into
 * the same event. One funnel, whichever session Android picked.
 */
package ya.remote

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

const val EVENT = "remoteKey"
/* The broadcast the expo-audio patch sends; the package name is prefixed at
   runtime so it is this app's alone. */
const val ACTION_SUFFIX = ".REMOTE_KEY"

/* A KeyEvent's name for JavaScript: null for a key that is not a media key,
   "" for the half of a press (the release, a repeat) that says nothing new. */
fun keyName(intent: Intent?): String? {
  val ev: KeyEvent = (if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
    else @Suppress("DEPRECATION") intent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT)) ?: return null
  val name = when (ev.keyCode) {
    KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
    KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> "pause"
    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "toggle"
    KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
    KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "previous"
    KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "forward"
    KeyEvent.KEYCODE_MEDIA_REWIND -> "rewind"
    else -> return null
  }
  return if (ev.action == KeyEvent.ACTION_DOWN && ev.repeatCount == 0) name else ""
}

@UnstableApi
class RemoteModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var player: StubPlayer? = null
  private var session: MediaSession? = null
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("YaRemote")
    Events(EVENT)

    Function("start") { title: String, playing: Boolean -> main.post { startSession(title, playing) } }
    Function("setPlaying") { playing: Boolean -> main.post { player?.setPlaying(playing) } }
    Function("setTitle") { title: String -> main.post { player?.setTitle(title) } }
    Function("stop") { main.post { stopSession() } }

    OnCreate { listen() }
    OnDestroy {
      unlisten()
      main.post { stopSession() }
    }
  }

  private fun emit(key: String) {
    if (key.isNotEmpty()) sendEvent(EVENT, mapOf("key" to key))
  }

  /* Media3 wants the player and the session made, used and released on one
     looper; everything here runs on the main one. */
  private fun startSession(title: String, playing: Boolean) {
    stopSession()
    val context = appContext.reactContext ?: return
    try {
      val p = StubPlayer(Looper.getMainLooper(), title, playing) { emit(it) }
      val s = MediaSession.Builder(context, p)
        .setId("YaRemote")
        .setCallback(object : MediaSession.Callback {
          override fun onMediaButtonEvent(session: MediaSession, controller: MediaSession.ControllerInfo, intent: Intent): Boolean {
            val k = keyName(intent) ?: return super.onMediaButtonEvent(session, controller, intent)
            emit(k)
            return true
          }
        })
        .build()
      player = p
      session = s
    } catch (e: Exception) {
      player = null
      session = null
    }
  }

  private fun stopSession() {
    val s = session
    val p = player
    session = null
    player = null
    try { s?.release() } catch (e: Exception) {}
    try { p?.release() } catch (e: Exception) {}
  }

  /* The keys expo-audio's sessions hand over (see the patch). */
  private fun listen() {
    val context = appContext.reactContext ?: return
    if (receiver != null) return
    val r = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, intent: Intent?) {
        val k = keyName(intent) ?: return
        emit(k)
      }
    }
    try {
      ContextCompat.registerReceiver(context, r, IntentFilter(context.packageName + ACTION_SUFFIX),
        ContextCompat.RECEIVER_NOT_EXPORTED)
      receiver = r
    } catch (e: Exception) {
      receiver = null
    }
  }

  private fun unlisten() {
    val r = receiver ?: return
    receiver = null
    try { appContext.reactContext?.unregisterReceiver(r) } catch (e: Exception) {}
  }
}

/* A player that plays nothing. It reports one item, ready, playing or
   paused as the screen says, so the platform counts the session as a current
   player and sends it the keys. Transport commands that arrive as commands
   rather than keys are reported, not performed: the screen decides. */
@UnstableApi
class StubPlayer(looper: Looper, private var title: String, private var playing: Boolean,
                 private val onKey: (String) -> Unit) : SimpleBasePlayer(looper) {
  private val commands = Player.Commands.Builder().addAll(
    Player.COMMAND_PLAY_PAUSE, Player.COMMAND_PREPARE, Player.COMMAND_STOP,
    Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_PREVIOUS,
    Player.COMMAND_SEEK_FORWARD, Player.COMMAND_SEEK_BACK,
    Player.COMMAND_GET_CURRENT_MEDIA_ITEM, Player.COMMAND_GET_TIMELINE, Player.COMMAND_GET_METADATA
  ).build()

  override fun getState(): State {
    val item = MediaItemData.Builder("ya")
      .setMediaItem(MediaItem.Builder().setMediaId("ya")
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist("Ya").build()).build())
      .build()
    return State.Builder()
      .setAvailableCommands(commands)
      .setPlaybackState(Player.STATE_READY)
      .setPlayWhenReady(playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaylist(listOf(item))
      .setCurrentMediaItemIndex(0)
      .setContentPositionMs(0)
      .build()
  }

  fun setPlaying(on: Boolean) { playing = on; invalidateState() }
  fun setTitle(t: String) { title = t; invalidateState() }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    onKey(if (playWhenReady) "play" else "pause")
    return Futures.immediateVoidFuture()
  }
  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    when (seekCommand) {
      Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> onKey("next")
      Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> onKey("previous")
      Player.COMMAND_SEEK_FORWARD -> onKey("forward")
      Player.COMMAND_SEEK_BACK -> onKey("rewind")
    }
    return Futures.immediateVoidFuture()
  }
  override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()
  override fun handleStop(): ListenableFuture<*> { onKey("pause"); return Futures.immediateVoidFuture() }
  override fun handleRelease(): ListenableFuture<*> = Futures.immediateVoidFuture()
}
