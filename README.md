# Techno Support Bot - Chatbot Application

## Overview

Techno Support Bot is an AI-powered chatbot designed to automate support and answer common queries. Built with Python, TensorFlow, and Flask, it uses natural language processing (NLP) to understand and respond to user inputs.

## Features

* Interactive chat interface with a futuristic design
* Pre-trained responses for common support queries
* Quick suggestion buttons for frequently asked questions
* Dynamic starfield background animation
* Neural network-based intent classification

## Technologies Used

* **Frontend:** HTML, CSS, JavaScript
* **Backend:** Python, Flask
* **AI/NLP:** TensorFlow, Keras, NLTK
* **Data Processing:** NumPy, JSON

## Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/yourusername/techno-support-bot.git](https://github.com/yourusername/techno-support-bot.git)
    cd techno-support-bot
    ```

2.  **Install the required dependencies**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Download NLTK data**
    ```python
    import nltk
    nltk.download('punkt')
    nltk.download('wordnet')
    ```

## Usage

**Run the Flask application**

```bash
python Flask_App.py
Open your web browser and navigate to

http://localhost:5000
Interact with the chatbot by typing messages or clicking suggestion buttons.

File Structure
techno-support-bot/
├── static/               
├── templates/           
│   └── index.html      
├── chatbot_model.h5     
├── classes.pkl          
├── words.pkl             
├── intents.json          
├── Flask_App.py          
└── requirements.txt      
Training the Model
Update intents.json with your new data.
Run the chatbot.ipynb notebook to retrain the model.
