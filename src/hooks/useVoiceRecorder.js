import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const getSpeechRecognitionConstructor = () => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export const useVoiceRecorder = ({ lang = "en-US", transcribeAudio } = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioURL, setAudioURL] = useState("");
  const [error, setError] = useState("");

  const speechConstructor = useMemo(getSpeechRecognitionConstructor, []);
  const isSupported = typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined";

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const chunksRef = useRef([]);
  const stopResolveRef = useRef(null);
  const finalTranscriptRef = useRef("");

  const cleanupStream = useCallback(() => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeAudioURL = useCallback((url) => {
    if (!url) return;
    URL.revokeObjectURL(url);
  }, []);

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
    setAudioURL((prev) => {
      revokeAudioURL(prev);
      return "";
    });
  }, [revokeAudioURL]);

  const stopSpeechRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // Ignore no-op stop errors
    }
  }, []);

  const setupSpeechRecognition = useCallback(() => {
    if (!speechConstructor) return;

    const recognition = new speechConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) {
          finalChunk += chunk;
        } else {
          interimChunk += chunk;
        }
      }

      if (finalChunk) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalChunk}`.trim();
      }

      const nextTranscript = `${finalTranscriptRef.current} ${interimChunk}`.trim();
      setTranscript(nextTranscript);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "not-allowed") {
        setError("Microphone permission denied.");
      } else if (event.error === "no-speech") {
        setError("No speech detected.");
      } else if (event.error === "audio-capture") {
        setError("No microphone device found.");
      } else {
        setError("Voice transcription failed.");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // Recognition can throw if started too quickly; recording still continues.
    }
  }, [lang, speechConstructor]);

  const stopRecording = useCallback(async () => {
    stopSpeechRecognition();
    cleanupStream();
    setIsPaused(false);
    setIsRecording(false);

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return audioBlob;

    const stoppedBlob = await new Promise((resolve) => {
      stopResolveRef.current = resolve;
      recorder.stop();
    });

    mediaRecorderRef.current = null;
    return stoppedBlob || null;
  }, [audioBlob, cleanupStream, stopSpeechRecognition]);

  const startRecording = useCallback(async () => {
    if (!isSupported || isTranscribing) {
      setError("Voice recording is not supported in this browser.");
      return false;
    }

    try {
      clearAudio();
      setError("");
      setTranscript("");
      finalTranscriptRef.current = "";

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" })
          : null;

        setAudioBlob(blob);
        if (blob) {
          setAudioURL((prev) => {
            revokeAudioURL(prev);
            return URL.createObjectURL(blob);
          });
        }

        if (stopResolveRef.current) {
          stopResolveRef.current(blob);
          stopResolveRef.current = null;
        }
      };

      mediaRecorder.start(250);
      setupSpeechRecognition();
      setIsRecording(true);
      setIsPaused(false);
      return true;
    } catch (recordError) {
      cleanupStream();
      if (recordError?.name === "NotAllowedError") {
        setError("Microphone permission denied.");
      } else if (recordError?.name === "NotFoundError") {
        setError("No microphone was found.");
      } else {
        setError("Unable to start recording.");
      }
      return false;
    }
  }, [clearAudio, cleanupStream, isSupported, isTranscribing, revokeAudioURL, setupSpeechRecognition]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    stopSpeechRecognition();
    setIsPaused(true);
  }, [stopSpeechRecognition]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    setupSpeechRecognition();
    setIsPaused(false);
  }, [setupSpeechRecognition]);

  const discardRecording = useCallback(async () => {
    await stopRecording();
    setError("");
    setTranscript("");
    finalTranscriptRef.current = "";
    clearAudio();
  }, [clearAudio, stopRecording]);

  const confirmRecording = useCallback(async () => {
    setError("");
    setIsTranscribing(true);

    try {
      let blob = audioBlob;
      if (isRecording || isPaused) {
        blob = await stopRecording();
      }

      let text = transcript.trim() || finalTranscriptRef.current.trim();
      if (!text && blob && typeof transcribeAudio === "function") {
        text = (await transcribeAudio(blob)).trim();
      }

      if (!text) {
        setError("No voice text detected. Please try again.");
      }

      clearAudio();
      setTranscript(text);
      return text;
    } catch {
      setError("Could not transcribe audio.");
      return "";
    } finally {
      setIsTranscribing(false);
    }
  }, [audioBlob, clearAudio, isPaused, isRecording, stopRecording, transcript, transcribeAudio]);

  useEffect(() => {
    return () => {
      stopSpeechRecognition();
      cleanupStream();
      revokeAudioURL(audioURL);
    };
  }, [audioURL, cleanupStream, revokeAudioURL, stopSpeechRecognition]);

  return {
    isSupported,
    isRecording,
    isPaused,
    isTranscribing,
    transcript,
    audioBlob,
    audioURL,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    confirmRecording
  };
};

