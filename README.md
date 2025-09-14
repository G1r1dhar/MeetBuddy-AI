# MeetBuddy AI

The intelligent assistant for your Google Meet sessions.  

MeetBuddy AI is a comprehensive web application designed to streamline your meeting workflow. By seamlessly integrating with Google Meet, it captures real-time transcripts, generates AI-powered summaries, and provides powerful insights to help you stay organized and productive.  

Whether you're a single user looking to keep track of your notes or an administrator managing a large team, MeetBuddy AI offers a centralized platform to manage, monitor, and gain valuable insights from your meetings.  

---

## Features

- **AI-Powered Summaries**  
  Automatically generates concise and accurate summaries of your Google Meet sessions, saving you time and ensuring you never miss a key decision or action item.

- **Live Transcription**  
  Get real-time, accurate transcriptions of your meetings, allowing you to focus on the conversation without worrying about taking notes.

- **Meeting Management Dashboard**  
  A central hub to view, manage, and access all your meeting transcripts and summaries. You can easily filter by date, participants, and status.

- **Calendar Integration**  
  Sync with Google Calendar to easily schedule and launch meetings directly from the MeetBuddy AI platform.

- **Admin Reporting**  
  The administrator dashboard provides a comprehensive overview of user activity, usage analytics, and system logs, giving you full control and insight into your organization's meeting data.

- **User and Content Management**  
  Admins can manage users, roles, and permissions, as well as review and manage meeting content.

---

## Getting Started

Follow these steps to get MeetBuddy AI up and running locally.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16.x or higher)  
- npm (comes with Node.js)  
- [Google Cloud API Key](https://cloud.google.com/speech-to-text)  
- [OpenAI API Key](https://platform.openai.com/)  
- (Optional) Database setup: MongoDB/PostgreSQL  

---

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/G1r1dhar/MeetBuddy-AI.git
Navigate to the project directory

bash
Copy code
cd MeetBuddy-AI
Install dependencies

bash
Copy code
npm install
Set up environment variables
Create a .env file in the root directory and add your API keys and configuration settings:

env
Copy code
GOOGLE_API_KEY=your_google_api_key
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_database_connection_string
Run the application

bash
Copy code
npm start
Technology Stack
Frontend: React (TypeScript)

Backend: Node.js, Express

Database: MongoDB / PostgreSQL

AI/Transcription: Google Cloud Speech-to-Text API, OpenAI API

Contributing
We welcome contributions!
Please check our Contributing Guidelines for details on our code of conduct and the process for submitting pull requests.

License
This project is licensed under the MIT License – see the LICENSE file for details.

Contact
Author: Bhaikar Giridhar

Email: giridhar2k20@gmail.com

GitHub: G1r1dhar
