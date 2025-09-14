"use client"

import { useState, useRef } from "react"
import { Camera, CameraOff, Mic, MicOff, Monitor, Users } from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"

interface VideoPanelProps {
  meeting: Meeting
}

export default function VideoPanel({ meeting }: VideoPanelProps) {
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const participants = [
    {
      id: "1",
      name: "You",
      isSpeaking: true,
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&loop=1&playlist=dQw4w9WgXcQ",
    },
    {
      id: "2",
      name: "Sarah Wilson",
      isSpeaking: false,
      videoUrl: "https://www.youtube.com/embed/jNQXAC9IVRw?autoplay=1&mute=1&controls=0&loop=1&playlist=jNQXAC9IVRw",
    },
    {
      id: "3",
      name: "Mike Johnson",
      isSpeaking: false,
      videoUrl: "https://www.youtube.com/embed/ScMzIvxBSi4?autoplay=1&mute=1&controls=0&loop=1&playlist=ScMzIvxBSi4",
    },
  ]

  return (
    <div className="flex-1 bg-black relative">
      {/* Main Video Area */}
      <div className="h-full flex items-center justify-center p-6">
        {isScreenSharing ? (
          <div className="w-full h-full bg-gray-900 rounded-lg flex items-center justify-center border border-yellow-500/30">
            <div className="text-center text-yellow-400">
              <Monitor className="w-16 h-16 mx-auto mb-4" />
              <p className="text-lg">Screen sharing simulation</p>
              <p className="text-sm text-cyan-400">Presenter's screen would appear here</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 w-full h-full max-w-4xl">
            {participants.map((participant, index) => (
              <div
                key={participant.id}
                className={`relative bg-gray-900 rounded-lg overflow-hidden border-2 ${
                  index === 0 ? "col-span-2" : ""
                } ${participant.isSpeaking ? "border-cyan-400 shadow-lg shadow-cyan-400/20" : "border-yellow-500/30"}`}
              >
                <iframe
                  src={participant.videoUrl}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={`${participant.name} video feed`}
                />

                {/* Speaking Indicator */}
                {participant.isSpeaking && (
                  <div className="absolute top-3 left-3 bg-cyan-400 px-3 py-1 rounded-full">
                    <span className="text-xs text-black font-bold">Speaking</span>
                  </div>
                )}

                {/* Participant Name Overlay */}
                <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1 rounded-full">
                  <span className="text-sm text-yellow-400 font-medium">{participant.name}</span>
                </div>

                {/* Mic Status */}
                <div className="absolute bottom-3 right-3">
                  {index === 0 ? (
                    isMicOn ? (
                      <div className="bg-cyan-400 p-2 rounded-full">
                        <Mic className="w-4 h-4 text-black" />
                      </div>
                    ) : (
                      <div className="bg-red-500 p-2 rounded-full">
                        <MicOff className="w-4 h-4 text-white" />
                      </div>
                    )
                  ) : (
                    <div className="bg-cyan-400 p-2 rounded-full">
                      <Mic className="w-4 h-4 text-black" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Participants List */}
      <div className="absolute top-4 right-4 bg-black/80 border border-yellow-500/30 rounded-lg p-4 backdrop-blur-sm">
        <div className="flex items-center space-x-2 text-yellow-400 mb-3">
          <Users className="w-5 h-5" />
          <span className="text-sm font-bold">Participants ({participants.length})</span>
        </div>
        <div className="space-y-2">
          {participants.map((participant) => (
            <div key={participant.id} className="flex items-center space-x-3 text-sm">
              <div
                className={`w-3 h-3 rounded-full ${participant.isSpeaking ? "bg-cyan-400 animate-pulse" : "bg-gray-600"}`}
              />
              <span className="text-white">{participant.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Camera and Mic Controls */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex space-x-4">
        <button
          onClick={() => setIsCameraOn(!isCameraOn)}
          className={`p-3 rounded-full transition-all ${
            isCameraOn ? "bg-yellow-500 text-black hover:bg-yellow-400" : "bg-red-500 text-white hover:bg-red-400"
          }`}
        >
          {isCameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
        </button>
        <button
          onClick={() => setIsMicOn(!isMicOn)}
          className={`p-3 rounded-full transition-all ${
            isMicOn ? "bg-cyan-400 text-black hover:bg-cyan-300" : "bg-red-500 text-white hover:bg-red-400"
          }`}
        >
          {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button
          onClick={() => setIsScreenSharing(!isScreenSharing)}
          className={`p-3 rounded-full transition-all ${
            isScreenSharing
              ? "bg-cyan-400 text-black hover:bg-cyan-300"
              : "bg-gray-700 text-yellow-400 hover:bg-gray-600 border border-yellow-500/30"
          }`}
        >
          <Monitor className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
