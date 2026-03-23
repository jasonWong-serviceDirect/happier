package dev.happier.audio

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.InputStream
import java.nio.FloatBuffer
import java.nio.LongBuffer

/**
 * Runs Silero VAD v5 ONNX inference per audio window.
 *
 * Thread-safety: NOT thread-safe. Call from a single thread (the audio capture thread).
 *
 * Usage:
 *   val vad = SileroVadDetector(modelInputStream)
 *   // For each 512-sample window of 16kHz mono PCM16LE:
 *   val probability = vad.process(pcm16leBytes)  // returns 0.0..1.0
 *   vad.close()
 */
class SileroVadDetector(modelStream: InputStream) : AutoCloseable {

    companion object {
        private const val SAMPLE_RATE = 16000L
        private const val WINDOW_SAMPLES = 512
        private const val CONTEXT_SAMPLES = 64
        private const val STATE_DIM = 128
    }

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val session: OrtSession

    // LSTM hidden state: shape [2, 1, 128] — persisted between calls.
    private val state = FloatArray(2 * 1 * STATE_DIM)

    // Context buffer: last 64 samples from previous window.
    private val context = FloatArray(CONTEXT_SAMPLES)

    init {
        val modelBytes = modelStream.use { it.readBytes() }
        val opts = OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(1)
            setInterOpNumThreads(1)
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        }
        session = env.createSession(modelBytes, opts)
    }

    /**
     * Process a 512-sample window of 16kHz mono PCM16LE audio.
     *
     * @param pcm16le Raw PCM16LE bytes (1024 bytes = 512 samples × 2 bytes/sample).
     * @return Speech probability in [0.0, 1.0].
     */
    fun process(pcm16le: ByteArray): Float {
        val samples = pcm16leToFloat(pcm16le)
        if (samples.size != WINDOW_SAMPLES) {
            throw IllegalArgumentException("Expected $WINDOW_SAMPLES samples, got ${samples.size}")
        }

        // Build input: context (64) + window (512) = 576 samples
        val inputSize = CONTEXT_SAMPLES + WINDOW_SAMPLES
        val inputData = FloatArray(inputSize)
        System.arraycopy(context, 0, inputData, 0, CONTEXT_SAMPLES)
        System.arraycopy(samples, 0, inputData, CONTEXT_SAMPLES, WINDOW_SAMPLES)

        val inputTensor = OnnxTensor.createTensor(
            env,
            FloatBuffer.wrap(inputData),
            longArrayOf(1, inputSize.toLong())
        )
        val stateTensor = OnnxTensor.createTensor(
            env,
            FloatBuffer.wrap(state),
            longArrayOf(2, 1, STATE_DIM.toLong())
        )
        val srTensor = OnnxTensor.createTensor(
            env,
            LongBuffer.wrap(longArrayOf(SAMPLE_RATE)),
            longArrayOf(1)
        )

        val inputs = mapOf(
            "input" to inputTensor,
            "state" to stateTensor,
            "sr" to srTensor
        )

        val results = session.run(inputs)

        // Output 0: speech probability — shape [1, 1] comes back as Array<FloatArray>
        val probability = try {
            val outputValue = results[0].value
            when (outputValue) {
                is Array<*> -> {
                    @Suppress("UNCHECKED_CAST")
                    (outputValue as Array<FloatArray>)[0][0]
                }
                is FloatArray -> outputValue[0]
                else -> (results[0] as OnnxTensor).floatBuffer.let { it.rewind(); it.get(0) }
            }
        } catch (_: Throwable) {
            0f
        }

        // Output 1: updated state [2, 1, 128] — comes back as Array<Array<FloatArray>>
        try {
            val stateValue = results[1].value
            when (stateValue) {
                is Array<*> -> {
                    @Suppress("UNCHECKED_CAST")
                    val stateArray = stateValue as Array<Array<FloatArray>>
                    var idx = 0
                    for (layer in stateArray) {
                        for (batch in layer) {
                            System.arraycopy(batch, 0, state, idx, batch.size)
                            idx += batch.size
                        }
                    }
                }
                else -> {
                    val buf = (results[1] as OnnxTensor).floatBuffer
                    buf.rewind()
                    buf.get(state)
                }
            }
        } catch (_: Throwable) {
            // Keep previous state on error.
        }

        // Update context with last 64 samples of the full input (context + window).
        System.arraycopy(inputData, inputSize - CONTEXT_SAMPLES, context, 0, CONTEXT_SAMPLES)

        // Clean up tensors
        results.close()
        inputTensor.close()
        stateTensor.close()
        srTensor.close()

        return probability
    }

    /** Reset LSTM state and context (e.g. between utterances). */
    fun resetState() {
        state.fill(0f)
        context.fill(0f)
    }

    override fun close() {
        try { session.close() } catch (_: Throwable) {}
    }

    private fun pcm16leToFloat(pcm16le: ByteArray): FloatArray {
        val sampleCount = pcm16le.size / 2
        val result = FloatArray(sampleCount)
        for (i in 0 until sampleCount) {
            val lo = pcm16le[i * 2].toInt() and 0xFF
            val hi = pcm16le[i * 2 + 1].toInt() and 0xFF
            val sample = (hi shl 8) or lo
            val signed = if (sample >= 0x8000) sample - 0x10000 else sample
            result[i] = signed / 32768f
        }
        return result
    }
}
