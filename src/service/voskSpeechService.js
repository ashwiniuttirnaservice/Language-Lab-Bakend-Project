const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

/**
 * Service to execute local Vosk speech recognition using python
 * and the 'vosk-model-small-en-in-0.4' model.
 */
class VoskSpeechService {
  /**
   * Evaluate a recorded audio file against a target reference paragraph.
   *
   * @param {string} audioFilePath - Absolute or relative path to the audio file
   * @param {string} targetParagraph - The reference text the student was asked to read
   * @returns {Promise<Object>} Evaluation results including accuracy_score, wpm, word_analysis, etc.
   */
  static async evaluateAudio(audioFilePath, targetParagraph) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(audioFilePath)) {
        return reject(new Error(`Audio file not found: ${audioFilePath}`));
      }

      const scriptPath = path.join(__dirname, "..", "scripts", "vosk_evaluate.py");
      const pythonExe = process.env.PYTHON_PATH || "python";

      const args = [
        scriptPath,
        "--audio",
        audioFilePath,
        "--paragraph",
        targetParagraph,
      ];

      const pyProcess = spawn(pythonExe, args);

      let stdoutData = "";
      let stderrData = "";

      pyProcess.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });

      pyProcess.stderr.on("data", (data) => {
        stderrData += data.toString();
      });

      pyProcess.on("close", (code) => {
        if (code !== 0) {
          console.error("[VoskService] Python exited with code:", code, stderrData);
          return reject(
            new Error(`Vosk evaluation failed (exit ${code}): ${stderrData || stdoutData}`)
          );
        }

        try {
          // Find JSON in stdout in case any library warnings were printed
          const trimmed = stdoutData.trim();
          const jsonStartIndex = trimmed.indexOf("{");
          const jsonEndIndex = trimmed.lastIndexOf("}");

          if (jsonStartIndex === -1 || jsonEndIndex === -1) {
            throw new Error(`Invalid JSON output from Vosk script: ${trimmed}`);
          }

          const jsonStr = trimmed.substring(jsonStartIndex, jsonEndIndex + 1);
          const parsed = JSON.parse(jsonStr);

          if (!parsed.success && parsed.error) {
            return reject(new Error(parsed.error));
          }

          resolve(parsed);
        } catch (parseError) {
          console.error("[VoskService] Parse error:", parseError, stdoutData);
          reject(new Error(`Failed to parse Vosk evaluation output: ${parseError.message}`));
        }
      });

      pyProcess.on("error", (err) => {
        console.error("[VoskService] Failed to start python process:", err);
        reject(new Error(`Failed to execute Python Vosk service: ${err.message}`));
      });
    });
  }
}

module.exports = VoskSpeechService;

