"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Settings,
  MessageSquare,
  Users,
} from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"
import { useMeeting } from "../contexts/MeetingContext"

interface MeetingControlsProps {
  meeting: Meeting
}

export default function MeetingControls({ meeting }: MeetingControlsProps) {
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const { endMeeting } = useMeeting()
  const router = useRouter()

  const handleEndMeeting = () => {
    endMeeting(meeting.id)
    router.push("/")
  }

  return (
    <div className="bg-gray-800 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsCameraOn(!isCameraOn)}
            className={`p-3 rounded-full transition-all ${
              isCameraOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"
            }`}
          >
            {isCameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setIsMicOn(!isMicOn)}
            className={`p-3 rounded-full transition-all ${
              isMicOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"
            }`}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`p-3 rounded-full transition-all ${
              isScreenSharing
                ? "bg-indigo-500 hover:bg-indigo-600 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-white"
            }`}
          >
            {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </button>
        </div>

        {/* Center Info */}
        <div className="text-center text-white">
          <p className="text-sm font-medium">{meeting.title}</p>
          <div className="flex items-center justify-center space-x-4 text-xs text-gray-300 mt-1">
            <span className="flex items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse" />
              Recording
            </span>
            <span className="flex items-center">
              <Users className="w-3 h-3 mr-1" />
              {meeting.participants.length + 1} participants
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowChat(!showChat)}
            className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <button className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all">
            <Settings className="w-5 h-5" />
          </button>

          <button
            onClick={handleEndMeeting}
            className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition-all flex items-center space-x-2"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Meeting</span>
          </button>
        </div>
      </div>
    </div>
  )
}
