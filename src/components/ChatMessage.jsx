import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  FiMenu,
  FiEdit,
  FiSettings,
  FiPlus,
  FiMic,
  FiPause,
  FiPlay,
  FiTrash2,
  FiCheck,
  FiCopy,
  FiLoader,
  FiSquare,
  FiVolume2,
  FiChevronDown,
  FiTool,
  FiSend,
  FiSearch,
  FiStar,
  FiGrid,
  FiList
} from "react-icons/fi"
import { useChatStore } from "../store/useChatStore"
import { useVoiceRecorder } from "../hooks/useVoiceRecorder"

const formatDateTime = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}

const getTimeGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return "Good Morning"
  if (hour < 17) return "Good Afternoon"
  if (hour < 21) return "Good Evening"
  return "Good Night"
}

const renderAssistantContent = (content) => {
  if (!content) return ""

  const tokens = content.split(/(\*[^*\n]+\*)/g)
  return tokens.map((token, index) => {
    if (/^\*[^*\n]+\*$/.test(token)) {
      return <strong key={`assistant-bold-${index}`}>{token.slice(1, -1)}</strong>
    }
    return <React.Fragment key={`assistant-text-${index}`}>{token}</React.Fragment>
  })
}

const getVisibleAssistantText = (content) => (content || "").replace(/\*([^*\n]+)\*/g, "$1")

const ChatMessage = ({ onLogout, userEmail }) => {
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [sidebarForceClosed, setSidebarForceClosed] = useState(false)
  const [input, setInput] = useState("")
  const [isComposerFocused, setIsComposerFocused] = useState(false)
  const [showMyStuff, setShowMyStuff] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [myStuffTwoColumns, setMyStuffTwoColumns] = useState(false)
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [modelMode, setModelMode] = useState("Fast")
  const [theme, setTheme] = useState("dark")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState("menu")
  const [selectedImage, setSelectedImage] = useState(null)
  const [selectedHistoryChatId, setSelectedHistoryChatId] = useState(null)
  const [copiedMessageId, setCopiedMessageId] = useState(null)

  const { chats, activeChatId, messages, loading, error, createChat, selectChat, sendMessage, deleteChat } =
    useChatStore()

  const messagesEndRef = useRef(null)
  const composerRef = useRef(null)
  const fileInputRef = useRef(null)
  const plusMenuRef = useRef(null)
  const avatarMenuRef = useRef(null)
  const toolsMenuRef = useRef(null)
  const modelMenuRef = useRef(null)
  const settingsMenuRef = useRef(null)
  const copyTimeoutRef = useRef(null)
  const {
    isSupported: isSpeechSupported,
    isRecording,
    isPaused,
    isTranscribing,
    audioURL,
    error: voiceError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    confirmRecording
  } = useVoiceRecorder()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = async (event) => {
      const targetTag = event.target?.tagName?.toLowerCase()
      if (targetTag === "input" || targetTag === "textarea") return
      if (event.key !== "Delete") return

      const chatIdToDelete = showMyStuff ? selectedHistoryChatId : activeChatId
      if (!chatIdToDelete) return

      await deleteChat(chatIdToDelete)
      if (showMyStuff) {
        setSelectedHistoryChatId(null)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeChatId, deleteChat, selectedHistoryChatId, showMyStuff])

  useEffect(() => {
    const onPointerDown = (event) => {
      const target = event.target

      if (avatarMenuRef.current && !avatarMenuRef.current.contains(target)) {
        setAvatarOpen(false)
      }

      if (toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setShowToolsMenu(false)
      }

      if (plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setShowPlusMenu(false)
      }

      if (modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false)
      }

      if (settingsMenuRef.current && !settingsMenuRef.current.contains(target)) {
        setSettingsOpen(false)
        setSettingsView("menu")
      }
    }

    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const filteredChats = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((chat) => (chat.title || "").toLowerCase().includes(q))
  }, [chats, searchText])

  const recentChats = filteredChats.slice(0, 10)

  const onSend = async () => {
    if (isTranscribing || isRecording || isPaused) return
    const text = input.trim()
    if (!text && !selectedImage) return
    setInput("")
    const outgoingImage = selectedImage
    setSelectedImage(null)
    await sendMessage(text, modelMode, outgoingImage)
  }

  const handleStartVoice = async () => {
    await startRecording()
  }

  const handleConfirmVoice = async () => {
    const text = await confirmRecording()
    if (!text) return
    setInput((prev) => {
      const base = prev.trim()
      return base ? `${base} ${text}` : text
    })
    setIsComposerFocused(true)
  }

  const handleCopyMessage = async (messageId, text, role) => {
    if (!text) return
    const copyText = role === "assistant" ? getVisibleAssistantText(text) : text
    try {
      await navigator.clipboard.writeText(copyText)
      setCopiedMessageId(messageId)
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedMessageId(null)
      }, 1200)
    } catch {
      // Ignore clipboard errors silently in UI
    }
  }

  const openFromHistory = async (chatId) => {
    setShowMyStuff(false)
    setSelectedHistoryChatId(null)
    await selectChat(chatId)
  }

  const avatarInitial = (userEmail?.trim()?.charAt(0) || "U").toUpperCase()

  const isLight = theme === "light"
  const sidebarOpen = !sidebarForceClosed && (sidebarPinned || sidebarHovered)
  const showWelcomeComposer = !showMyStuff && messages.length === 0 && !loading
  const greeting = getTimeGreeting()
  const isStreamingAssistantMessage = loading && messages[messages.length - 1]?.role === "assistant"
  const hasVoiceDraft = Boolean(audioURL)
  const isVoiceSessionActive = isRecording || isPaused || isTranscribing

  const handleSidebarToggle = () => {
    if (sidebarPinned) {
      setSidebarPinned(false)
      setSidebarForceClosed(true)
      return
    }
    setSidebarForceClosed(false)
    setSidebarPinned(true)
  }

  const composer = (
    <form
      ref={composerRef}
      onSubmit={(e) => {
        e.preventDefault()
        onSend()
      }}
      className={`w-full border transition-all duration-200 ${
        isComposerFocused ? "rounded-[28px] p-4 gap-4" : "rounded-[22px] px-3 py-2 gap-2"
      } flex flex-col ${
        isLight
          ? "bg-white border-[#d1d5db] focus-within:bg-[#f8fafc]"
          : "bg-[#1e1f20] border-[#333537] focus-within:bg-[#282a2c]"
      }`}
    >
      <div className="flex items-center gap-3 px-2">
        {isVoiceSessionActive ? (
          <div className={`voice-wave-track flex-1 h-[40px] flex items-center gap-1.5 px-3 ${isPaused ? "is-paused" : ""}`}>
            {Array.from({ length: 12 }).map((_, index) => (
              <span
                key={`voice-wave-${index}`}
                className={`voice-wave-bar ${isPaused ? "is-paused" : ""}`}
                style={{ animationDelay: `${index * 90}ms` }}
              />
            ))}
          </div>
        ) : (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsComposerFocused(true)}
            onBlur={() => {
              requestAnimationFrame(() => {
                if (composerRef.current?.contains(document.activeElement)) return
                setIsComposerFocused(false)
                setShowPlusMenu(false)
                setShowToolsMenu(false)
                setShowModelMenu(false)
              })
            }}
            placeholder="Ask ChitChat"
            className="bg-transparent border-none outline-none flex-1 text-base placeholder-[#8e918f]"
          />
        )}

        {isTranscribing ? (
          <button
            type="button"
            className="p-2 rounded-full opacity-80 cursor-not-allowed"
            disabled
            title="Transcribing"
          >
            <FiLoader size={20} className="animate-spin" />
          </button>
        ) : (isRecording || isPaused || hasVoiceDraft) ? (
          <button
            type="button"
            onClick={handleConfirmVoice}
            className="p-2 hover:bg-[#333537] rounded-full transition disabled:opacity-40"
            disabled={loading}
            title="Confirm voice input"
          >
            <FiCheck size={20} />
          </button>
        ) : (
          <button
            type="submit"
            className="p-2 hover:bg-[#333537] rounded-full transition disabled:opacity-40"
            disabled={(!input.trim() && !selectedImage) || loading}
            title="Send"
          >
            <FiSend size={20} />
          </button>
        )}
      </div>

      {selectedImage && (
        <div className={`mx-2 px-3 py-2 rounded-lg border flex items-center justify-between ${isLight ? "border-[#d1d5db] bg-[#f8fafc]" : "border-[#333537] bg-[#282a2c]"}`}>
          <span className="text-sm truncate max-w-[75%]">{selectedImage.name}</span>
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="text-xs text-[#9aa0a6] hover:text-[#e3e3e3]"
          >
            Remove
          </button>
        </div>
      )}

      {isComposerFocused && (
        <div className={`flex justify-between items-center px-2 ${isTranscribing ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="flex gap-2">
            <div className="relative" ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => setShowPlusMenu((v) => !v)}
                className={`p-2 rounded-full flex items-center gap-2 text-sm ${isLight ? "hover:bg-[#e5e7eb]" : "hover:bg-[#333537]"}`}
              >
                <FiPlus size={20} />
              </button>
              {showPlusMenu && (
                <div className={`absolute left-0 bottom-12 min-w-[150px] border rounded-lg p-1 z-30 ${isLight ? "bg-white border-[#d1d5db]" : "bg-[#131314] border-[#333537]"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click()
                      setShowPlusMenu(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"}`}
                  >
                    Upload File
                  </button>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file || !file.type.startsWith("image/")) return
                const reader = new FileReader()
                reader.onload = () => {
                  setSelectedImage({
                    name: file.name,
                    dataUrl: reader.result,
                    type: file.type
                  })
                  setModelMode("Analyze")
                }
                reader.readAsDataURL(file)
                e.target.value = ""
              }}
            />
            <div className="relative" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={() => setShowToolsMenu((v) => !v)}
                className={`p-2 rounded-full flex items-center gap-2 text-sm ${isLight ? "hover:bg-[#e5e7eb]" : "hover:bg-[#333537]"}`}
              >
                <FiTool size={18} /> Tools
              </button>
              {showToolsMenu && (
                <div className={`absolute left-0 bottom-12 min-w-[160px] border rounded-lg p-1 z-30 ${isLight ? "bg-white border-[#d1d5db]" : "bg-[#131314] border-[#333537]"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setTheme("light")
                      setShowToolsMenu(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"}`}
                  >
                    Light mode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTheme("dark")
                      setShowToolsMenu(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"}`}
                  >
                    Dark mode
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setShowModelMenu((v) => !v)}
                className={`flex items-center gap-1 text-sm px-2 py-1 rounded-md ${isLight ? "hover:bg-[#e5e7eb]" : "hover:bg-[#333537]"}`}
              >
                {modelMode} <FiChevronDown />
              </button>
              {showModelMenu && (
                <div className={`absolute right-0 bottom-10 min-w-[120px] border rounded-lg p-1 z-30 ${isLight ? "bg-white border-[#d1d5db]" : "bg-[#131314] border-[#333537]"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setModelMode("Fast")
                      setShowModelMenu(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${modelMode === "Fast" ? (isLight ? "bg-[#eff6ff]" : "bg-[#1f3a68] text-white") : (isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]")}`}
                  >
                    Fast
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModelMode("Pro")
                      setShowModelMenu(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${modelMode === "Pro" ? (isLight ? "bg-[#eff6ff]" : "bg-[#1f3a68] text-white") : (isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]")}`}
                  >
                    Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModelMode("Analyze")
                      setShowModelMenu(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${modelMode === "Analyze" ? (isLight ? "bg-[#eff6ff]" : "bg-[#1f3a68] text-white") : (isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]")}`}
                  >
                    Analyze
                  </button>
                </div>
              )}
            </div>
            {isRecording || isPaused ? (
              <>
                <button
                  type="button"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className={`voice-action-btn ${isLight ? "hover:bg-[#e5e7eb]" : "hover:bg-[#333537]"}`}
                  disabled={isTranscribing}
                  title={isPaused ? "Resume recording" : "Pause recording"}
                >
                  {isPaused ? <FiPlay size={18} /> : <FiPause size={18} />}
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className={`voice-action-btn ${isLight ? "hover:bg-[#e5e7eb]" : "hover:bg-[#333537]"}`}
                  disabled={isTranscribing}
                  title="Stop and review"
                >
                  <FiSquare size={16} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartVoice}
                className={`voice-action-btn ${isLight ? "hover:bg-[#e5e7eb]" : "hover:bg-[#333537]"}`}
                disabled={isTranscribing || !isSpeechSupported}
                title={!isSpeechSupported ? "Voice input not supported" : "Start voice input"}
              >
                <FiMic size={20} />
              </button>
            )}

            {hasVoiceDraft && !isRecording && (
              <div className={`voice-review-wrap ${isLight ? "voice-review-light" : "voice-review-dark"}`}>
                {audioURL && (
                  <>
                    <span className="voice-review-icon" aria-hidden="true">
                      <FiVolume2 size={14} />
                    </span>
                    <audio
                      controls
                      src={audioURL}
                      className="voice-audio-player"
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={discardRecording}
                  className={`voice-action-btn ${isLight ? "hover:bg-[#e5e7eb]" : "hover:bg-[#333537]"}`}
                  disabled={isTranscribing}
                  title="Delete voice draft"
                >
                  <FiTrash2 size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {voiceError && <div className="px-2 text-xs text-red-400">{voiceError}</div>}
    </form>
  )

  return (
    <div className={`flex h-screen overflow-hidden ${isLight ? "bg-[#f3f4f6] text-[#111827]" : "bg-[#000000] text-[#e3e3e3]"}`}>
      <aside
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => {
          setSidebarHovered(false)
          setSidebarForceClosed(false)
        }}
        className={`py-4 flex flex-col justify-between transition-[width] duration-300 ease-in-out ${
          sidebarOpen ? "w-[280px] px-3" : "w-16 items-center px-2"
        } ${isLight ? "bg-[#e5e7eb]" : "bg-[#131314]"}`}
      >
        <div className="flex flex-col gap-4 min-h-0">
          <div className={`flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}>
            <button onClick={handleSidebarToggle} className="p-2 hover:bg-[#282a2c] rounded-full transition">
              <FiMenu size={22} />
            </button>
            {sidebarOpen && (
              <button
                className="p-2 hover:bg-[#282a2c] rounded-full transition"
                onClick={() => setSearchOpen((v) => !v)}
                title="Search chats"
              >
                <FiSearch size={18} />
              </button>
            )}
          </div>

          {sidebarOpen && searchOpen && (
            <div className="px-1">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search chat history"
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${
                  isLight
                    ? "bg-white border-[#cbd5e1] placeholder-[#6b7280] focus:border-[#2563eb]"
                    : "bg-[#1e1f20] border-[#333537] placeholder-[#8e918f] focus:border-[#1f3a68]"
                }`}
              />
            </div>
          )}

          <button
            onClick={createChat}
            className={`flex items-center gap-3 p-2 rounded-lg transition ${
              isLight ? "hover:bg-[#d1d5db]" : "hover:bg-[#1e1f20]"
            } ${
              sidebarOpen ? "" : "justify-center"
            }`}
          >
            <FiEdit size={20} />
            {sidebarOpen && <span className="text-sm">New chat</span>}
          </button>

          <button
            onClick={() => setShowMyStuff((v) => !v)}
            className={`flex items-center gap-3 p-2 rounded-lg transition ${
              showMyStuff ? "bg-[#1f3a68] text-white" : isLight ? "hover:bg-[#d1d5db]" : "hover:bg-[#1e1f20]"
            } ${sidebarOpen ? "" : "justify-center"}`}
          >
            <FiStar size={18} />
            {sidebarOpen && <span className="text-sm">My stuff</span>}
          </button>

          {sidebarOpen && (
            <div className="mt-2 min-h-0 flex-1 flex flex-col">
              <div className="px-2 text-xs text-[#9aa0a6] mb-2">Chats (Last 10)</div>
              <div className="space-y-2 overflow-y-auto pr-1">
                {recentChats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectChat(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition ${
                      c.id === activeChatId && !showMyStuff
                        ? "bg-[#1f3a68] text-white"
                        : isLight
                        ? "hover:bg-[#d1d5db] text-[#1f2937]"
                        : "hover:bg-[#1e1f20] text-[#c7c7c7]"
                    }`}
                  >
                    <div className="truncate">{c.title || "Untitled Chat"}</div>
                    <div className="text-[11px] text-[#9aa0a6] mt-1">{formatDateTime(c.updatedAt)}</div>
                  </button>
                ))}
                {!recentChats.length && <div className="px-2 text-xs text-[#9aa0a6]">No chats found</div>}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={settingsMenuRef}>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen((v) => !v)
              setSettingsView("menu")
            }}
            className={`w-full flex items-center gap-3 p-2 rounded-lg transition ${
              isLight ? "hover:bg-[#d1d5db]" : "hover:bg-[#1e1f20]"
            } ${sidebarOpen ? "" : "justify-center"}`}
          >
            <FiSettings size={20} />
            {sidebarOpen && <span className="text-sm">Settings and help</span>}
          </button>

          {settingsOpen && (
            <div
              className={`absolute left-0 bottom-12 w-full border rounded-lg p-2 z-30 ${
                isLight ? "bg-white border-[#d1d5db]" : "bg-[#131314] border-[#333537]"
              }`}
            >
              {settingsView === "menu" && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSettingsView("profile")}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${
                      isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"
                    }`}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsView("theme")}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${
                      isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"
                    }`}
                  >
                    Theme
                  </button>
                </div>
              )}

              {settingsView === "profile" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Profile</span>
                    <button
                      type="button"
                      onClick={() => setSettingsView("menu")}
                      className={`text-xs px-2 py-1 rounded ${
                        isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"
                      }`}
                    >
                      Back
                    </button>
                  </div>
                  <div className="text-xs text-[#9aa0a6]">Email</div>
                  <div className={`text-sm border rounded px-2 py-2 ${isLight ? "border-[#d1d5db]" : "border-[#333537]"}`}>
                    {userEmail || "No email"}
                  </div>
                  <div className="text-xs text-[#9aa0a6]">Password</div>
                  <div className={`text-sm border rounded px-2 py-2 ${isLight ? "border-[#d1d5db]" : "border-[#333537]"}`}>
                    ********
                  </div>
                </div>
              )}

              {settingsView === "theme" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Theme</span>
                    <button
                      type="button"
                      onClick={() => setSettingsView("menu")}
                      className={`text-xs px-2 py-1 rounded ${
                        isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"
                      }`}
                    >
                      Back
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${
                      isLight ? "bg-[#eff6ff] text-[#111827]" : "hover:bg-[#1e1f20]"
                    }`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md ${
                      !isLight ? "bg-[#1f3a68] text-white" : "hover:bg-[#f3f4f6]"
                    }`}
                  >
                    Dark
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        <header className={`flex justify-between items-center p-4 border-b ${isLight ? "border-[#d1d5db]" : "border-[#1e1f20]"}`}>
          <div className="text-xl font-medium px-2">ChitChat</div>
          <div className="flex items-center gap-3">
            {showMyStuff && (
              <button
                type="button"
                onClick={() => setMyStuffTwoColumns((v) => !v)}
                className={`p-2 rounded-md border ${isLight ? "bg-white hover:bg-[#f3f4f6] border-[#d1d5db]" : "bg-[#1e1f20] hover:bg-[#282a2c] border-[#333537]"}`}
                title={myStuffTwoColumns ? "Single column view" : "Two column view"}
              >
                {myStuffTwoColumns ? <FiList size={18} /> : <FiGrid size={18} />}
              </button>
            )}
            <div className="relative" ref={avatarMenuRef}>
            <button
              type="button"
              onClick={() => setAvatarOpen((v) => !v)}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${isLight ? "bg-[#2563eb] text-white" : "bg-[#1f3a68]"}`}
              title="Account"
            >
              {avatarInitial}
            </button>
            {avatarOpen && (
              <div className={`absolute right-0 mt-2 border rounded-lg p-1 min-w-[120px] z-20 ${isLight ? "bg-white border-[#d1d5db]" : "bg-[#131314] border-[#333537]"}`}>
                <button
                  type="button"
                  onClick={onLogout}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md ${isLight ? "hover:bg-[#f3f4f6]" : "hover:bg-[#1e1f20]"}`}
                >
                  Logout
                </button>
              </div>
              )}
            </div>
          </div>
        </header>

        {showWelcomeComposer ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-3xl">
              <div className="mb-8 pl-3">
                <h2 className={`text-xl font-medium ${isLight ? "text-[#111827]" : "text-[#e3e3e3]"}`}>
                  Hi, {greeting}!
                </h2>
                <p className={`text-3xl font-semibold mt-2 ${isLight ? "text-[#111827]" : "text-[#e3e3e3]"}`}>
                  What’s on your mind?
                </p>
              </div>
              {composer}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-44">
            <div className="w-full max-w-3xl mx-auto space-y-4 pt-4">
            {error && <div className="text-sm text-red-400 border border-red-900/40 bg-red-950/20 rounded-lg px-3 py-2">{error}</div>}

            {showMyStuff ? (
              <div className={myStuffTwoColumns ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-2"}>
                <div className={`text-sm text-[#9aa0a6] mb-2 ${myStuffTwoColumns ? "md:col-span-2" : ""}`}>
                  All chat history
                </div>
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedHistoryChatId(chat.id)}
                    onDoubleClick={() => openFromHistory(chat.id)}
                    className={`w-full text-left border rounded-xl px-4 py-3 ${
                      selectedHistoryChatId === chat.id
                        ? "bg-[#1f3a68] text-white border-[#1f3a68]"
                        : isLight
                        ? "bg-white hover:bg-[#f3f4f6] border-[#d1d5db]"
                        : "bg-[#1e1f20] hover:bg-[#282a2c] border-[#333537]"
                    }`}
                  >
                    <div className={`text-sm truncate ${selectedHistoryChatId === chat.id ? "text-white" : isLight ? "text-[#111827]" : "text-[#e3e3e3]"}`}>{chat.title || "Untitled Chat"}</div>
                    <div className={`text-xs mt-1 ${selectedHistoryChatId === chat.id ? "text-blue-100" : "text-[#9aa0a6]"}`}>Updated {formatDateTime(chat.updatedAt)}</div>
                  </button>
                ))}
                {!filteredChats.length && <div className="text-sm text-[#9aa0a6]">No chat history found.</div>}
              </div>
            ) : (
              <>
                {!activeChatId && <div className="text-center text-sm text-[#9aa0a6] mt-10">Start by typing a message below.</div>}

                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed relative ${
                        m.role === "user"
                          ? "bg-[#1f3a68] text-white"
                          : isLight
                          ? "bg-white text-[#111827] border border-[#d1d5db]"
                          : "bg-[#1e1f20] text-[#e3e3e3] border border-[#333537]"
                      }`}
                    >
                      {m.role === "assistant" && (
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(m.id, m.content, m.role)}
                          className={`absolute bottom-2 right-2 text-[11px] px-2 py-1 rounded-md transition ${
                            isLight
                              ? "bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151]"
                              : "bg-[#2a2b2d] hover:bg-[#3a3b3d] text-[#d1d5db]"
                          }`}
                          title="Copy"
                        >
                          {copiedMessageId === m.id ? "Copied!" : <FiCopy size={13} />}
                        </button>
                      )}
                      <div className={m.role === "assistant" ? "whitespace-pre-wrap pr-12 pb-8" : "whitespace-pre-wrap"}>
                        {m.role === "assistant" ? renderAssistantContent(m.content) : m.content}
                      </div>
                      <div className={`text-[11px] mt-2 ${m.role === "user" ? "text-blue-100" : "text-[#9aa0a6]"}`}>
                        {formatDateTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && !isStreamingAssistantMessage && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[#1e1f20] text-[#9aa0a6] border border-[#333537]">
                      Typing...
                    </div>
                  </div>
                )}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>
          </div>
        )}

        {!showMyStuff && !showWelcomeComposer && (
          <div className={`absolute bottom-0 left-0 right-0 ${isLight ? "bg-[#f3f4f6]" : "bg-black"}`}>
            <div className="w-full max-w-3xl mx-auto px-4 pb-6">
              {composer}

            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const SuggestionChip = ({ icon, label }) => (
  <button type="button" className="flex items-center gap-2 bg-[#131314] hover:bg-[#1e1f20] border border-[#444746] px-4 py-2.5 rounded-xl text-sm transition-colors">
    {icon} <span>{label}</span>
  </button>
)

export default ChatMessage
