//! Offline speech to text (whisper.cpp through `whisper-rs`), for apps that take spoken
//! statements. Nothing here talks to a network: the model is a file on the computer.
//!
//! A transcript is only ever an aid. Whatever this returns is a draft until a person has
//! read it against the recording and kept or corrected it; the app decides how that is shown.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// A transcribed phrase, timed in milliseconds from the start of the audio it came from.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

#[derive(Debug)]
pub enum SpeechError {
    /// No model file was found where one is expected.
    ModelMissing,
    /// The audio was not 16 kHz mono 32-bit float samples.
    InvalidAudio,
    /// The engine failed; the message is for the log, not for the officer.
    Engine(String),
}

impl std::fmt::Display for SpeechError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpeechError::ModelMissing => write!(f, "The speech model is not on this computer."),
            SpeechError::InvalidAudio => write!(f, "The audio could not be read."),
            SpeechError::Engine(e) => write!(f, "The speech engine failed: {e}"),
        }
    }
}

impl std::error::Error for SpeechError {}

/// Where the model is looked for: `PLEADLI_WHISPER_MODEL` if set, then
/// `<data_dir>/models/ggml-base.bin`.
pub fn model_path(data_dir: &Path) -> Option<PathBuf> {
    if let Some(custom) = std::env::var_os("PLEADLI_WHISPER_MODEL") {
        let path = PathBuf::from(custom);
        return path.is_file().then_some(path);
    }
    let path = data_dir.join("models").join("ggml-base.bin");
    path.is_file().then_some(path)
}

/// Keeps the loaded model between calls; loading takes seconds.
#[derive(Default)]
pub struct Transcriber {
    loaded: Mutex<Option<(PathBuf, WhisperContext)>>,
}

impl Transcriber {
    /// Transcribes 16 kHz mono samples. Blocking: run it on a worker thread.
    /// `language` is a two-letter code ("en", "sw", "fr"), or None to detect it.
    pub fn transcribe(&self, model: &Path, samples: &[f32], language: Option<&str>) -> Result<Vec<Segment>, SpeechError> {
        let mut loaded = self.loaded.lock().map_err(|_| SpeechError::Engine("interrupted".into()))?;
        if loaded.as_ref().map(|(path, _)| path.as_path()) != Some(model) {
            let context = WhisperContext::new_with_params(model.to_string_lossy().as_ref(), WhisperContextParameters::default())
                .map_err(|e| SpeechError::Engine(e.to_string()))?;
            *loaded = Some((model.to_path_buf(), context));
        }
        let (_, context) = loaded.as_ref().ok_or(SpeechError::ModelMissing)?;

        let mut state = context.create_state().map_err(|e| SpeechError::Engine(e.to_string()))?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(language.unwrap_or("auto")));
        params.set_n_threads(worker_threads());
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        state.full(params, samples).map_err(|e| SpeechError::Engine(e.to_string()))?;

        let raw = (0..state.full_n_segments()).filter_map(|index| state.get_segment(index)).map(|segment| {
            let text = segment.to_str_lossy().map(|t| t.into_owned()).unwrap_or_default();
            (segment.start_timestamp(), segment.end_timestamp(), text)
        });
        Ok(normalize_segments(raw))
    }
}

fn worker_threads() -> i32 {
    std::thread::available_parallelism().map(|n| n.get().clamp(1, 8) as i32).unwrap_or(4)
}

/// Converts whisper's centisecond timings to milliseconds and drops empty or non-speech
/// segments such as "[BLANK_AUDIO]".
pub fn normalize_segments(raw: impl IntoIterator<Item = (i64, i64, String)>) -> Vec<Segment> {
    raw.into_iter()
        .filter_map(|(start, end, text)| {
            let text = text.trim();
            let is_marker = text.starts_with('[') && text.ends_with(']');
            (!text.is_empty() && !is_marker).then(|| Segment { start_ms: start * 10, end_ms: end * 10, text: text.to_string() })
        })
        .collect()
}

/// Reads little-endian 32-bit float samples sent by the window.
pub fn samples_from_bytes(bytes: &[u8]) -> Result<Vec<f32>, SpeechError> {
    if bytes.len() % 4 != 0 {
        return Err(SpeechError::InvalidAudio);
    }
    Ok(bytes.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_timings_and_drops_markers() {
        let segments = normalize_segments([
            (0, 150, " He hit me with a bottle. ".to_string()),
            (150, 300, "[BLANK_AUDIO]".to_string()),
            (300, 420, "   ".to_string()),
            (420, 610, " I fell down.".to_string()),
        ]);
        assert_eq!(
            segments,
            vec![
                Segment { start_ms: 0, end_ms: 1500, text: "He hit me with a bottle.".into() },
                Segment { start_ms: 4200, end_ms: 6100, text: "I fell down.".into() },
            ]
        );
    }

    #[test]
    fn reads_little_endian_samples() {
        let bytes: Vec<u8> = [0.5f32, -1.0].iter().flat_map(|s| s.to_le_bytes()).collect();
        assert_eq!(samples_from_bytes(&bytes).unwrap(), vec![0.5, -1.0]);
        assert!(samples_from_bytes(&[0, 1, 2]).is_err());
    }

    /// Runs the real model on a real recording. Needs a model and a 16 kHz mono f32 file:
    /// PLEADLI_WHISPER_MODEL=... PLEADLI_SPEECH_SAMPLE=... cargo test --features speech -- --ignored speaks
    #[test]
    #[ignore = "needs a model file and a sample recording"]
    fn speaks() {
        let model = PathBuf::from(std::env::var("PLEADLI_WHISPER_MODEL").expect("PLEADLI_WHISPER_MODEL"));
        let sample = std::env::var("PLEADLI_SPEECH_SAMPLE").expect("PLEADLI_SPEECH_SAMPLE");
        let samples = samples_from_bytes(&std::fs::read(sample).unwrap()).unwrap();
        let segments = Transcriber::default().transcribe(&model, &samples, Some("en")).unwrap();
        for s in &segments {
            println!("{} to {} ms: {}", s.start_ms, s.end_ms, s.text);
        }
        let all = segments.iter().map(|s| s.text.to_lowercase()).collect::<Vec<_>>().join(" ");
        assert!(all.contains("bottle"), "transcript was: {all}");
    }

    #[test]
    fn a_missing_model_is_not_found() {
        assert!(model_path(Path::new("/nonexistent-pleadli-dir")).is_none() || std::env::var_os("PLEADLI_WHISPER_MODEL").is_some());
    }
}
