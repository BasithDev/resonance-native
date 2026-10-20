package expo.modules.ytdlp

import android.content.Context
import android.util.Log
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.SSLException

private const val TAG = "Ytdlp"
private const val PROGRESS_EVENT = "onProgress"
private val YOUTUBE_ID = Regex("^[A-Za-z0-9_-]{11}$")

// stderr fragments that mean "no/bad connection" rather than "extractor broke".
private val NETWORK_HINTS = listOf(
  "urlopen error",
  "Errno 7",
  "Errno 101",
  "Errno 110",
  "Errno 111",
  "Errno 104",
  "getaddrinfo",
  "Name or service not known",
  "No address associated with hostname",
  "Temporary failure in name resolution",
  "Network is unreachable",
  "timed out",
  "Connection reset",
  "Connection refused",
  "Connection aborted",
  "RemoteDisconnected",
)

class YtdlpModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  /** jobIds whose cancel() was requested; checked when their download finishes or starts. */
  private val cancelRequested = ConcurrentHashMap.newKeySet<String>()

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Ytdlp")

    Events(PROGRESS_EVENT)

    OnCreate {
      // Unpacking python on first launch takes seconds — keep it off the startup thread.
      val ctx = context
      scope.launch {
        try {
          YoutubeDL.getInstance().init(ctx)
        } catch (e: Throwable) {
          Log.e(TAG, "yt-dlp init failed (will retry on first call)", e)
        }
      }
    }

    OnDestroy {
      scope.cancel()
    }

    AsyncFunction("search") Coroutine { query: String, limit: Int ->
      runJob {
        val json = dumpJson(YoutubeDLRequest("ytsearch$limit:$query").addOption("--flat-playlist"))
        tracksFromEntries(json.optJSONArray("entries"))
      }
    }

    AsyncFunction("playlistEntries") Coroutine { url: String ->
      runJob {
        val json = dumpJson(YoutubeDLRequest(url).addOption("--flat-playlist"))
        tracksFromEntries(json.optJSONArray("entries"))
      }
    }

    AsyncFunction("videoInfo") Coroutine { urlOrId: String ->
      runJob {
        val url = if (YOUTUBE_ID.matches(urlOrId)) watchUrl(urlOrId) else urlOrId
        val json = dumpJson(YoutubeDLRequest(url).addOption("--no-playlist"))
        toTrack(json) ?: throw extractionFailed("No video id in yt-dlp output")
      }
    }

    AsyncFunction("resolveStream") Coroutine { youtubeId: String ->
      runJob {
        val request = YoutubeDLRequest(watchUrl(youtubeId))
          .addOption("-f", "bestaudio")
          .addOption("--no-playlist")
        val url = YoutubeDL.getInstance().getInfo(request).url
        if (url.isNullOrEmpty()) throw extractionFailed("yt-dlp returned no stream URL")
        mapOf("url" to url)
      }
    }

    AsyncFunction("download") Coroutine { jobId: String, youtubeId: String, destDir: String ->
      runJob(jobId) {
        val dir = File(destDir.removePrefix("file://"))
        if (!dir.isDirectory && !dir.mkdirs()) throw extractionFailed("Cannot create $dir")
        try {
          if (cancelRequested.contains(jobId)) throw YoutubeDL.CanceledException()
          val request = YoutubeDLRequest(watchUrl(youtubeId))
            .addOption("-f", "bestaudio[ext=webm]/bestaudio")
            .addOption("-o", "${dir.absolutePath}/$youtubeId.%(ext)s")
            .addOption("--no-playlist")
            .addOption("--no-mtime")
          var lastPercent = -1
          YoutubeDL.getInstance().execute(request, jobId, false) { progress, eta, _ ->
            val percent = progress.toInt().coerceIn(0, 100)
            if (percent != lastPercent) {
              lastPercent = percent
              sendProgress(jobId, percent, eta)
            }
          }
          val file = dir.listFiles()
            ?.filter { it.name.startsWith("$youtubeId.") && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") }
            ?.maxByOrNull { it.lastModified() }
            ?: throw extractionFailed("yt-dlp finished but produced no file")
          if (lastPercent != 100) sendProgress(jobId, 100, 0)
          mapOf("path" to file.absolutePath, "sizeBytes" to file.length())
        } catch (e: Throwable) {
          deletePartials(dir, youtubeId)
          throw e
        }
      }
    }

    Function("cancel") { jobId: String ->
      cancelRequested.add(jobId)
      YoutubeDL.getInstance().destroyProcessById(jobId)
      Unit
    }

    AsyncFunction("version") Coroutine { ->
      runJob {
        val request = YoutubeDLRequest(emptyList<String>()).addOption("--version")
        YoutubeDL.getInstance().execute(request, null, false, null).out.trim()
      }
    }

    AsyncFunction("update") Coroutine { ->
      runJob {
        when (YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel.STABLE)) {
          YoutubeDL.UpdateStatus.DONE -> "updated"
          else -> "up-to-date"
        }
      }
    }
  }

  /** Runs [block] on the IO dispatcher after init, mapping every failure to a coded rejection. */
  private suspend fun <T> runJob(jobId: String? = null, block: () -> T): T = withContext(Dispatchers.IO) {
    try {
      YoutubeDL.getInstance().init(context)
      block()
    } catch (e: Throwable) {
      val cancelled = jobId != null && cancelRequested.contains(jobId)
      throw if (cancelled) CodedException("CANCELLED", "Download cancelled", e) else toCoded(e)
    } finally {
      if (jobId != null) cancelRequested.remove(jobId)
    }
  }

  private fun dumpJson(request: YoutubeDLRequest): JSONObject {
    val out = YoutubeDL.getInstance().execute(request.addOption("-J"), null, false, null).out
    return try {
      JSONObject(out)
    } catch (e: Exception) {
      throw extractionFailed("Unparseable yt-dlp output", e)
    }
  }

  private fun tracksFromEntries(entries: JSONArray?): List<Map<String, Any?>> {
    if (entries == null) return emptyList()
    return (0 until entries.length()).mapNotNull { i -> entries.optJSONObject(i)?.let(::toTrack) }
  }

  private fun toTrack(o: JSONObject): Map<String, Any?>? {
    val id = o.optString("id").takeIf { YOUTUBE_ID.matches(it) } ?: return null
    val channel = o.str("channel") ?: o.str("uploader")
    val duration = o.optDouble("duration").takeUnless { it.isNaN() }?.toInt()
    return mapOf(
      "youtubeId" to id,
      "title" to (o.str("title") ?: id),
      "channel" to channel,
      "durationSec" to duration,
      "thumbnailUrl" to thumbnail(o, id),
    )
  }

  private fun thumbnail(o: JSONObject, id: String): String {
    o.str("thumbnail")?.let { return it }
    val thumbs = o.optJSONArray("thumbnails")
    if (thumbs != null) {
      for (i in thumbs.length() - 1 downTo 0) {
        thumbs.optJSONObject(i)?.str("url")?.let { return it }
      }
    }
    return "https://i.ytimg.com/vi/$id/hqdefault.jpg"
  }

  private fun JSONObject.str(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

  private fun sendProgress(jobId: String, percent: Int, etaSec: Long) {
    sendEvent(PROGRESS_EVENT, mapOf("jobId" to jobId, "percent" to percent, "etaSec" to etaSec))
  }

  private fun deletePartials(dir: File, youtubeId: String) {
    dir.listFiles()?.filter { it.name.startsWith("$youtubeId.") }?.forEach { it.delete() }
  }

  private fun watchUrl(id: String) = "https://www.youtube.com/watch?v=$id"

  private fun extractionFailed(message: String, cause: Throwable? = null) =
    CodedException("EXTRACTION_FAILED", message, cause)

  private fun toCoded(e: Throwable): CodedException {
    if (e is CodedException) return e
    if (e is YoutubeDL.CanceledException || e is InterruptedException) {
      return CodedException("CANCELLED", "Cancelled", e)
    }
    val message = e.message ?: e.javaClass.simpleName
    val socketCause = generateSequence(e) { it.cause }.any {
      it is UnknownHostException || it is SocketException || it is SocketTimeoutException || it is SSLException
    }
    if (socketCause || NETWORK_HINTS.any { message.contains(it, ignoreCase = true) }) {
      return CodedException("NETWORK", message, e)
    }
    return CodedException("EXTRACTION_FAILED", message, e)
  }
}
