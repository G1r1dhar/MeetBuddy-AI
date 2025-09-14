export interface SummaryResult {
  overallSummary: string
  keyPoints: string[]
  actionItems: string[]
  nextSteps: string[]
  topics: string[]
}

export class AISummarizerService {
  private static instance: AISummarizerService

  static getInstance(): AISummarizerService {
    if (!AISummarizerService.instance) {
      AISummarizerService.instance = new AISummarizerService()
    }
    return AISummarizerService.instance
  }

  private readonly meetingSummarizerPrompt = `You are an AI Meeting Summarizer. Your job:
- Listen to the conversation transcript.
- Produce a clear and structured summary.
- Keep the tone professional, concise, and easy to scan.

Rules:
1. Start with a short **overall summary** (2–3 sentences).
2. Provide **bullet points** of key decisions, action items, and important topics.
3. Highlight deadlines, names, or tasks in **bold**.
4. If the transcript is unclear, infer context but never invent facts.
5. End with a short "Next Steps" section.

Format:
- Use markdown for structure.
- Keep sentences short and dynamic.`

  async generateSummary(transcript: string, meetingTitle: string): Promise<SummaryResult> {
    // In production, this would call an actual AI API (OpenAI, Anthropic, etc.)
    // For now, we'll simulate the AI response based on the transcript content

    if (!transcript || transcript.trim().length === 0) {
      return this.getEmptySummary()
    }

    // Simulate AI processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Parse transcript and generate structured summary
    return this.processTranscriptWithAI(transcript, meetingTitle)
  }

  private async processTranscriptWithAI(transcript: string, meetingTitle: string): Promise<SummaryResult> {
    // In production, this would be replaced with actual AI API calls
    // For demonstration, we'll create intelligent summaries based on transcript content

    const words = transcript.toLowerCase().split(/\s+/)
    const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim().length > 0)

    // Extract key topics based on common meeting keywords
    const topics = this.extractTopics(transcript)

    // Generate contextual summary based on content
    const overallSummary = this.generateContextualSummary(sentences, meetingTitle, topics)

    // Extract action items and decisions
    const actionItems = this.extractActionItems(sentences)

    // Generate key points
    const keyPoints = this.extractKeyPoints(sentences, topics)

    // Generate next steps
    const nextSteps = this.generateNextSteps(actionItems, topics)

    return {
      overallSummary,
      keyPoints,
      actionItems,
      nextSteps,
      topics,
    }
  }

  private extractTopics(transcript: string): string[] {
    const topicKeywords = {
      "Project Management": ["project", "milestone", "deadline", "timeline", "deliverable"],
      Strategy: ["strategy", "plan", "goal", "objective", "vision"],
      Development: ["development", "code", "feature", "bug", "testing"],
      Marketing: ["marketing", "campaign", "brand", "customer", "promotion"],
      Finance: ["budget", "cost", "revenue", "profit", "investment"],
      "Team Management": ["team", "hiring", "performance", "training", "collaboration"],
      Product: ["product", "feature", "user", "feedback", "requirements"],
      Sales: ["sales", "client", "deal", "proposal", "contract"],
    }

    const foundTopics: string[] = []
    const lowerTranscript = transcript.toLowerCase()

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const matches = keywords.filter((keyword) => lowerTranscript.includes(keyword))
      if (matches.length >= 2) {
        foundTopics.push(topic)
      }
    }

    return foundTopics.slice(0, 5) // Limit to 5 topics
  }

  private generateContextualSummary(sentences: string[], meetingTitle: string, topics: string[]): string {
    const summaryTemplates = [
      `The ${meetingTitle} meeting focused on ${topics.slice(0, 2).join(" and ").toLowerCase()} with key stakeholders discussing progress and next steps. Important decisions were made regarding project direction and resource allocation.`,
      `Team members gathered to review ${topics[0]?.toLowerCase() || "current initiatives"} and address critical challenges. The discussion covered strategic priorities and established clear action items for moving forward.`,
      `This ${meetingTitle} session addressed ${topics.slice(0, 2).join(", ").toLowerCase()} with emphasis on collaboration and problem-solving. Participants aligned on key objectives and identified areas requiring immediate attention.`,
    ]

    return summaryTemplates[Math.floor(Math.random() * summaryTemplates.length)]
  }

  private extractActionItems(sentences: string[]): string[] {
    const actionKeywords = [
      "will",
      "should",
      "need to",
      "must",
      "follow up",
      "schedule",
      "review",
      "complete",
      "deliver",
    ]
    const actionItems: string[] = []

    sentences.forEach((sentence) => {
      const lowerSentence = sentence.toLowerCase()
      if (actionKeywords.some((keyword) => lowerSentence.includes(keyword))) {
        // Clean and format the action item
        const cleanSentence = sentence.trim().replace(/^(and|so|then|also)\s+/i, "")
        if (cleanSentence.length > 10 && cleanSentence.length < 100) {
          actionItems.push(cleanSentence)
        }
      }
    })

    // If no specific action items found, generate generic ones
    if (actionItems.length === 0) {
      return [
        "Follow up on key discussion points with relevant stakeholders",
        "Schedule next meeting to review progress on identified initiatives",
        "Document and share meeting outcomes with team members",
      ]
    }

    return actionItems.slice(0, 5) // Limit to 5 action items
  }

  private extractKeyPoints(sentences: string[], topics: string[]): string[] {
    const keyPoints: string[] = []

    // Generate key points based on topics and content
    topics.forEach((topic) => {
      keyPoints.push(`**${topic}**: Discussed current status and identified improvement opportunities`)
    })

    // Add generic key points if needed
    if (keyPoints.length < 3) {
      keyPoints.push(
        "**Team Collaboration**: Emphasized importance of cross-functional communication",
        "**Progress Review**: Evaluated current milestones and upcoming deliverables",
        "**Resource Planning**: Assessed team capacity and project requirements",
      )
    }

    return keyPoints.slice(0, 6) // Limit to 6 key points
  }

  private generateNextSteps(actionItems: string[], topics: string[]): string[] {
    const nextSteps: string[] = []

    if (actionItems.length > 0) {
      nextSteps.push(`**Immediate Actions**: Complete ${actionItems.length} identified action items by next review`)
    }

    if (topics.length > 0) {
      nextSteps.push(`**Follow-up Meeting**: Schedule session to review progress on ${topics[0]?.toLowerCase()}`)
    }

    nextSteps.push("**Documentation**: Share meeting summary and action items with all participants")

    return nextSteps.slice(0, 4) // Limit to 4 next steps
  }

  private getEmptySummary(): SummaryResult {
    return {
      overallSummary:
        "No transcript available for summary generation. Please ensure the meeting was properly recorded and transcribed.",
      keyPoints: ["Meeting recording or transcription was not available"],
      actionItems: ["Verify meeting capture settings for future sessions"],
      nextSteps: ["Ensure proper setup for next meeting recording"],
      topics: [],
    }
  }

  // Method to integrate with actual AI APIs in production
  async callAIAPI(prompt: string, transcript: string): Promise<string> {
    // This would be replaced with actual API calls to:
    // - OpenAI GPT-4
    // - Anthropic Claude
    // - Google Gemini
    // - Azure OpenAI

    const fullPrompt = `${this.meetingSummarizerPrompt}\n\nMeeting Transcript:\n${transcript}\n\nPlease provide a structured summary:`

    // Placeholder for actual API integration
    console.log("AI API call would be made here with prompt:", fullPrompt)

    return "AI-generated summary would be returned here"
  }
}
