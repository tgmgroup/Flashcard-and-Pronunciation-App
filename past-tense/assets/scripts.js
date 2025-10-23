// script.js content starts here
// ========================================
// DOM Elements
// ========================================
const wordFileUrlInput = document.getElementById("wordFileUrl");
const loadWordsBtn = document.getElementById("loadWordsBtn");
const loadStatusElement = document.getElementById("loadStatus");
const audioPlayer = document.getElementById("audioPlayer");
const toastContainer = document.getElementById("toast-container");
const themeToggle = document.getElementById("theme-toggle");
const configSection = document.getElementById("config-section");

// Modal Elements
const appModal = document.getElementById("appModal");
const modalContentArea = document.getElementById("modalContentArea");
const modalCloseBtn = document.getElementById("modalCloseBtn");

// Mode Buttons
const mode1Btn = document.getElementById("mode1Btn");
const mode2Btn = document.getElementById("mode2Btn");
const mode3Btn = document.getElementById("mode3Btn");
const mode4Btn = document.getElementById("mode4Btn"); 

// Mode Sections (kept as references to their original DOM location)
const mode1Section = document.getElementById("mode1");
const mode2Section = document.getElementById("mode2");
const mode3Section = document.getElementById("mode3");
const mode4Section = document.getElementById("mode4"); 

// Mode 1 Elements
const wordListTableBody = document.querySelector("#word-list-table tbody");

// Mode 2 Elements
const flashcardGridMode2 = document.getElementById("flashcard-grid-mode2");
const startMode2Btn = document.getElementById("startMode2Btn");
const progressContainerMode2 = document.getElementById( "progress-container-mode2");
const progressTextMode2 = document.getElementById("progress-text-mode2");
const progressBarFillMode2 = document.getElementById("progress-bar-fill-mode2");

// Mode 3 Elements
const flashcardGridMode3 = document.getElementById("flashcard-grid-mode3");
const startMode3Btn = document.getElementById("startMode3Btn");
const stopSpeechBtn = document.getElementById("stopSpeechBtn");
const currentSpeechWordDisplay = document.getElementById("currentSpeechWordDisplay");
const speechFeedback = document.getElementById("speechFeedback");
const progressContainerMode3 = document.getElementById("progress-container-mode3");
const progressTextMode3 = document.getElementById("progress-text-mode3");
const progressBarFillMode3 = document.getElementById("progress-bar-fill-mode3");

// Mode 4 Elements
const flashcardGridMode4 = document.getElementById("flashcard-grid-mode4");
const startMode4Btn = document.getElementById("startMode4Btn");
const stopSpeechBtn4 = document.getElementById("stopSpeechBtn4");
const currentSpeechWordDisplay4 = document.getElementById("currentSpeechWordDisplay4");
const speechFeedback4 = document.getElementById("speechFeedback4");
const progressContainerMode4 = document.getElementById("progress-container-mode4");
const progressTextMode4 = document.getElementById("progress-text-mode4");
const progressBarFillMode4 = document.getElementById("progress-bar-fill-mode4");


// ========================================
// Global Variables
// ========================================
let allWords = []; 
/* New Word Structure (10 columns): 
{ 
  number, 
  japanese, 
  present, presentVoiceUrl, presentExample, presentExampleVoiceUrl, 
  past, pastVoiceUrl, pastExample, pastExampleVoiceUrl, 
  isUsedInCurrentRound 
}
*/
let wordUsage = {}; 
const NUM_FLASHCARDS = 8; 
const FLASHCARD_MATCH_DELAY_MS = 1000; 
const SPEECH_RECOGNITION_THRESHOLD = 0.7; 
let currentMode = null; 

// Mode 2 specific
let selectedCards = []; 
let matchedPairs = 0; 
const CARDS_PER_MATCH = 3; // Japanese, Present, Past

// Mode 3 & 4 specific
let recognition; 
let isRecording = false; 
let currentSpeechWord = null; 
let correctSpeechCount = 0; 
let speechFlashcardDeck = []; 
let currentSpeechCardIndex = -1; 
let speechRecognitionStep = 0; // Mode 3 now only has a single step (0)


// ========================================
// Utility Functions
// ========================================
/** * Displays a toast notification. */
function showToast(message, type = "info", duration = 3000) { 
  const toast = document.createElement("div"); 
  toast.classList.add("toast", type); 
  toast.textContent = message; 
  toastContainer.appendChild(toast); 
  void toast.offsetWidth; 
  toast.classList.add("show"); 
  setTimeout(() => { 
    toast.classList.remove("show"); 
    toast.addEventListener("transitionend", () => toast.remove(), { once: true, }); 
  }, duration);
}

/** * Plays the pronunciation of a word. */
function playPronunciation(url) { 
  if (url) { 
    audioPlayer.src = url; 
    audioPlayer.play().catch((e) => console.error("Error playing audio:", e)); 
  } else { 
    showToast("No voice file available for this word.", "info", 2000); 
  }
}

/** * Saves word usage data to localStorage. */
function saveWordUsage() { 
  localStorage.setItem("wordUsage", JSON.stringify(wordUsage));
}

/** * Initializes word usage data for newly loaded words. */
function initializeWordUsage() { 
  allWords.forEach((word) => { 
    if (!wordUsage[word.number]) { 
      wordUsage[word.number] = { usedCount: 0, difficulty: 0 }; 
    }
  }); 
  saveWordUsage();
}

/** * Loads word usage data from localStorage. */
function loadWordUsage() { 
  const savedUsage = localStorage.getItem("wordUsage"); 
  if (savedUsage) { 
    wordUsage = JSON.parse(savedUsage); 
  }
}

/** * Updates the progress bar. */
function updateProgressBar( 
  progressBarFillEl, 
  progressTextEl, 
  current, 
  total, 
  unit
) { 
  const percentage = total === 0 ? 0 : (current / total) * 100; 
  progressBarFillEl.style.width = `${percentage}%`; 
  progressTextEl.textContent = `${current}/${total} ${unit}`;
}

/** * Weighted random selection of words. */
function selectWeightedRandomWords(words, count) { 
  if (words.length === 0) return []; 
  words.forEach(word => {
    if (word.isUsedInCurrentRound === undefined) {
      word.isUsedInCurrentRound = false;
    }
  });

  const availableWords = words.filter((word) => !word.isUsedInCurrentRound);

  if (availableWords.length < count) {
    allWords.forEach((word) => (word.isUsedInCurrentRound = false));
    return selectWeightedRandomWords(words, count);
  }

  const weightedWords = availableWords.map((word) => {
    const usageData = wordUsage[word.number] || { usedCount: 0, difficulty: 0 };
    let weight = 1.0;
    weight /= usageData.usedCount + 1;
    weight *= usageData.difficulty + 1;
    return { word, weight: Math.max(0.1, weight) };
  });

  let cumulativeWeights = [];
  let totalWeight = 0;
  for (const item of weightedWords) {
    totalWeight += item.weight;
    cumulativeWeights.push({ word: item.word, cumulativeWeight: totalWeight });
  }

  const selected = new Set();
  while (selected.size < count && cumulativeWeights.length > 0) {
    const randomValue = Math.random() * totalWeight;
    for (let i = 0; i < cumulativeWeights.length; i++) {
      if (randomValue < cumulativeWeights[i].cumulativeWeight) {
        const wordToAdd = cumulativeWeights[i].word;
        if (!selected.has(wordToAdd)) {
          selected.add(wordToAdd);
          wordToAdd.isUsedInCurrentRound = true;
        }
        break;
      }
    }
  }
  return Array.from(selected);
}

// Levenshtein Distance
function levenshteinDistance(s, t) { 
  if (!s.length) return t.length; 
  if (!t.length) return s.length; 
  const matrix = Array(t.length + 1).fill(null).map(() => Array(s.length + 1).fill(null)); 
  for (let i = 0; i <= t.length; i++) matrix[i][0] = i; 
  for (let j = 0; j <= s.length; j++) matrix[0][j] = j; 
  for (let i = 1; i <= t.length; i++) { 
    for (let j = 1; j <= s.length; j++) { 
      const cost = s[j - 1] === t[i - 1] ? 0 : 1; 
      matrix[i][j] = Math.min( 
        matrix[i - 1][j] + 1, 
        matrix[i][j - 1] + 1, 
        matrix[i - 1][j - 1] + cost 
      ); 
    }
  } 
  return matrix[t.length][s.length];
}

// normalizeText
function normalizeText(text) { 
  return text 
    .toLowerCase() 
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

// calculateAccuracy
function calculateAccuracy(originalText, recognizedText) { 
  const normOriginal = normalizeText(originalText); 
  const normRecognized = normalizeText(recognizedText); 
  if (!normOriginal) return { accuracy: 0, troublesomeWords: [] }; 
  if (!normRecognized) return { accuracy: 0, troublesomeWords: normOriginal.split(/\s+/).filter(Boolean), }; 
  const distance = levenshteinDistance(normOriginal, normRecognized); 
  const maxLength = Math.max(normOriginal.length, normRecognized.length); 
  const accuracy = Math.round((maxLength === 0 ? 1 : 1 - distance / maxLength) * 100 ); 
  const originalWords = normOriginal.split(/\s+/).filter(Boolean); 
  const recognizedWordSet = new Set( normRecognized.split(/\s+/).filter(Boolean) ); 
  const troublesomeWords = originalWords.filter( (word) => !recognizedWordSet.has(word) ); 
  return { accuracy, troublesomeWords };
}


// ========================================
// Theme Toggle
// ========================================
themeToggle.addEventListener("click", () => { 
  document.documentElement.classList.toggle("dark-mode"); 
  const isDarkMode = document.documentElement.classList.contains("dark-mode"); 
  localStorage.setItem("darkMode", isDarkMode);
});

// Apply theme on load
function applyTheme() { 
  const savedTheme = localStorage.getItem("darkMode");
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === "true") {
    document.documentElement.classList.add("dark-mode");
  } else if (savedTheme === "false") {
    document.documentElement.classList.remove("dark-mode");
  } 
  else if (prefersDark) {
    document.documentElement.classList.add("dark-mode");
  } 
  else {
    document.documentElement.classList.remove("dark-mode");
  }
}

// ========================================
// Word Loading (10-Column CSV)
// ========================================
/**
 * Loads the word list from the specified URL using the 10-column CSV format.
 */
async function loadWords() {
  const url = wordFileUrlInput.value.trim();

  if (!url) {
    showToast("Please enter a word file URL.", "error");
    return;
  }

  loadStatusElement.textContent = "Loading words...";
  loadStatusElement.classList.remove("hidden");
  loadWordsBtn.disabled = true;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();

    // EXPECTED 10 COLUMNS: 
    // 1. Number, 2. Japanese, 3. Present Tense, 4. Present Voice URL, 5. Present Example, 
    // 6. Present Example Voice URL, 7. Past Tense, 8. Past Voice URL, 9. Past Example, 
    // 10. Past Example Voice URL
    allWords = text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const parts = line.split(",").map(p => p.trim()); 
        
        if (parts.length === 10) {
          return {
            number: parseInt(parts[0]),
            japanese: parts[1],
            present: parts[2],
            presentVoiceUrl: parts[3],
            presentExample: parts[4],
            presentExampleVoiceUrl: parts[5],
            past: parts[6],
            pastVoiceUrl: parts[7],
            pastExample: parts[8],
            pastExampleVoiceUrl: parts[9],
            isUsedInCurrentRound: false,
          };
        }
        return null; 
      })
      .filter((word) => word !== null);

    if (allWords.length === 0) {
      showToast("No words found in the file or invalid format (expected 10 columns).", "error");
      loadStatusElement.textContent = "Failed to load words: No words found.";
      configSection.classList.remove("hidden"); 
      return;
    }

    initializeWordUsage();
    showToast(`Successfully loaded ${allWords.length} words!`, "success");
    loadStatusElement.textContent = `Loaded ${allWords.length} words.`;
    configSection.classList.add("hidden"); 
  } catch (error) {
    console.error("Error loading words:", error);
    showToast(`Failed to load words: ${error.message}`, "error");
    loadStatusElement.textContent = `Failed to load words: ${error.message}`;
    configSection.classList.remove("hidden");
  } finally {
    loadWordsBtn.disabled = false;
  }
}

// ========================================
// Modal & Mode Switching
// ========================================
function hideAllModes() {
  if (currentMode === "mode1") {
    document.body.appendChild(mode1Section);
  } else if (currentMode === "mode2") {
    document.body.appendChild(mode2Section);
  } else if (currentMode === "mode3") {
    document.body.appendChild(mode3Section);
  } else if (currentMode === "mode4") {
    document.body.appendChild(mode4Section);
  }

  mode1Section.classList.add("hidden");
  mode2Section.classList.add("hidden");
  mode3Section.classList.add("hidden");
  mode4Section.classList.add("hidden"); 
  
  document.querySelectorAll("#mode-selection button").forEach((button) => {
    button.classList.remove("active");
  });

  if (audioPlayer) audioPlayer.pause();
  stopSpeechRecognitionMode3();
  stopSpeechRecognitionMode4(); 
}

function showModeInModal(modeElement) {
  modalContentArea.innerHTML = "";
  modalContentArea.appendChild(modeElement);
  modeElement.classList.remove("hidden");
  appModal.classList.remove("hidden");
}

function hideModal() {
  appModal.classList.add("hidden");

  if (currentMode === "mode2") {
    flashcardGridMode2.innerHTML = "";
    selectedCards = [];
    matchedPairs = 0;
    progressContainerMode2.classList.add("hidden");
    startMode2Btn.classList.remove("hidden");
  } else if (currentMode === "mode3") {
    flashcardGridMode3.innerHTML = "";
    stopSpeechRecognitionMode3();
    correctSpeechCount = 0;
    currentSpeechWord = null;
    currentSpeechWordDisplay.classList.add("hidden");
    speechFeedback.classList.add("hidden");
    progressContainerMode3.classList.add("hidden");
    startMode3Btn.classList.remove("hidden");
    stopSpeechBtn.classList.add("hidden");
  } else if (currentMode === "mode4") {
    flashcardGridMode4.innerHTML = "";
    stopSpeechRecognitionMode4();
    correctSpeechCount = 0;
    currentSpeechWord = null;
    currentSpeechWordDisplay4.classList.add("hidden");
    speechFeedback4.classList.add("hidden");
    progressContainerMode4.classList.add("hidden");
    startMode4Btn.classList.remove("hidden");
    stopSpeechBtn4.classList.add("hidden");
  }

  hideAllModes();
  currentMode = null;
}

function activateMode(modeId, buttonElement) {
  if (allWords.length === 0 && modeId !== "mode1") {
    showToast("Please load words first using the 'Load Words' button.", "info");
    return;
  }

  if (currentMode !== null) {
    hideModal();
  }

  currentMode = modeId;

  document.querySelectorAll("#mode-selection button").forEach((btn) => {
    btn.classList.remove("active");
  });
  buttonElement.classList.add("active");

  if (modeId === "mode1") {
    showModeInModal(mode1Section);
    displayMode1();
  } else if (modeId === "mode2") {
    showModeInModal(mode2Section);
  } else if (modeId === "mode3") {
    showModeInModal(mode3Section);
    setupSpeechRecognitionForMode3();
  } else if (modeId === "mode4") {
    showModeInModal(mode4Section);
    setupSpeechRecognitionForMode4();
  }
}

// ========================================
// Mode 1: Full Word List
// ========================================
function displayMode1() {
  wordListTableBody.innerHTML = ""; 

  if (allWords.length === 0) {
    wordListTableBody.innerHTML = '<tr><td colspan="6">No words loaded. Please load a word file.</td></tr>';
    return;
  }
  
  const tableHead = document.querySelector("#word-list-table thead tr");
  tableHead.innerHTML = `
    <th>#</th>
    <th>Japanese</th>
    <th>Present (Click Word/Ex)</th>
    <th>Past (Click Word/Ex)</th>
    <th>Usage/Difficulty</th>
  `;

  allWords.forEach((word) => {
    const row = wordListTableBody.insertRow();
    const usageData = wordUsage[word.number] || { usedCount: 0, difficulty: 0 };

    row.insertCell().textContent = word.number;

    // Japanese
    row.insertCell().textContent = word.japanese;

    // Present Tense (Word + Example, both clickable for their respective audio)
    const presentCell = row.insertCell();
    presentCell.innerHTML = `
        <span class="clickable-english" style="cursor: pointer; font-weight: bold;" 
              onclick="playPronunciation('${word.presentVoiceUrl}')">${word.present}</span><br>
        <span class="clickable-english" style="cursor: pointer; font-size: 0.9em;" 
              onclick="playPronunciation('${word.presentExampleVoiceUrl}')">(${word.presentExample})</span>
    `;

    // Past Tense (Word + Example, both clickable for their respective audio)
    const pastCell = row.insertCell();
    pastCell.innerHTML = `
        <span class="clickable-english" style="cursor: pointer; font-weight: bold;" 
              onclick="playPronunciation('${word.pastVoiceUrl}')">${word.past}</span><br>
        <span class="clickable-english" style="cursor: pointer; font-size: 0.9em;" 
              onclick="playPronunciation('${word.pastExampleVoiceUrl}')">(${word.pastExample})</span>
    `;

    row.insertCell().textContent = `Used: ${usageData.usedCount}, Diff: ${usageData.difficulty}`;
  });
}

// ========================================
// Mode 2: Matching Flashcards (3-Card Match)
// ========================================
function generateMode2Flashcards() {
  flashcardGridMode2.innerHTML = "";
  flashcardGridMode2.style.pointerEvents = "auto";
  selectedCards = [];
  matchedPairs = 0; 

  progressContainerMode2.classList.remove("hidden");
  startMode2Btn.classList.add("hidden"); 

  updateProgressBar(
    progressBarFillMode2,
    progressTextMode2,
    matchedPairs,
    NUM_FLASHCARDS,
    "Matched Sets"
  );

  allWords.forEach((word) => (word.isUsedInCurrentRound = false));
  const wordsForRound = selectWeightedRandomWords(allWords, NUM_FLASHCARDS);

  if (wordsForRound.length < NUM_FLASHCARDS) {
    showToast(
      `Not enough unique words (${wordsForRound.length}) to create ${NUM_FLASHCARDS} sets.`,
      "error",
      5000
    );
    startMode2Btn.classList.remove("hidden");
    return;
  }

  let cards = [];
  wordsForRound.forEach((word) => {
    const id = word.number;
    
    // Japanese card (no voice)
    cards.push({ id, type: "japanese", content: word.japanese, voiceUrl: null }); 
    // Present Tense card (uses present Tense voice)
    cards.push({ id, type: "present", content: word.present, voiceUrl: word.presentVoiceUrl });
    // Past Tense card (uses past Tense voice)
    cards.push({ id, type: "past", content: word.past, voiceUrl: word.pastVoiceUrl });
  });

  cards.sort(() => 0.5 - Math.random());

  cards.forEach((cardData) => {
    const flashcard = document.createElement("div");
    flashcard.classList.add("flashcard");
    flashcard.dataset.id = cardData.id;
    flashcard.dataset.type = cardData.type;
    flashcard.innerHTML = `<div class="flashcard-content">${cardData.content}</div>`;

    flashcard.addEventListener("click", () => {
      if (cardData.voiceUrl) {
        playPronunciation(cardData.voiceUrl);
      }
      handleFlashcardClickMode2(flashcard);
    });
    flashcardGridMode2.appendChild(flashcard);
  });
}

function handleFlashcardClickMode2(clickedCard) {
  if (
    clickedCard.classList.contains("cleared") ||
    clickedCard.classList.contains("match-selected") ||
    selectedCards.length === CARDS_PER_MATCH
  ) {
    return;
  }

  clickedCard.classList.add("match-selected");
  selectedCards.push(clickedCard);

  if (selectedCards.length === CARDS_PER_MATCH) {
    const cardIds = new Set(selectedCards.map(card => card.dataset.id));
    const cardTypes = new Set(selectedCards.map(card => card.dataset.type));
    
    const isMatch = cardIds.size === 1 && cardTypes.size === CARDS_PER_MATCH;

    flashcardGridMode2.style.pointerEvents = "none";

    if (isMatch) {
      showToast("3-Card Match!", "success", 1000);
      
      selectedCards.forEach(card => {
        card.classList.remove("match-selected");
        card.classList.add("cleared");
      });

      matchedPairs++;
      updateProgressBar(
        progressBarFillMode2,
        progressTextMode2,
        matchedPairs,
        NUM_FLASHCARDS,
        "Matched Sets"
      );

      const wordNumber = parseInt(cardIds.values().next().value);
      if (wordUsage[wordNumber]) {
        wordUsage[wordNumber].usedCount++;
        wordUsage[wordNumber].difficulty = Math.max(0, wordUsage[wordNumber].difficulty - 1);
        saveWordUsage();
      }

      if (matchedPairs === NUM_FLASHCARDS) {
        setTimeout(() => {
          showToast("Round Complete! Starting a new round...", "info", 2000);
          selectedCards = [];
          matchedPairs = 0;
          flashcardGridMode2.style.pointerEvents = "auto";
          generateMode2Flashcards(); 
        }, 1000);
      } else {
        selectedCards = [];
        flashcardGridMode2.style.pointerEvents = "auto";
      }
    } else {
      showToast("No match. Try again!", "error", 1000);

      selectedCards.forEach((card) => {
        const wordNumber = parseInt(card.dataset.id);
        if (wordUsage[wordNumber]) {
          wordUsage[wordNumber].difficulty++;
          saveWordUsage();
        }
      });

      setTimeout(() => {
        selectedCards.forEach(card => card.classList.remove("match-selected"));
        selectedCards = []; 
        flashcardGridMode2.style.pointerEvents = "auto";
      }, FLASHCARD_MATCH_DELAY_MS);
    }
  }
}

// ========================================
// Mode 3: Speak Present and Past Tense (Combined)
// ========================================

function setupSpeechRecognitionForMode3() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    speechFeedback.textContent = "Speech recognition is not supported in your browser.";
    startMode3Btn.disabled = true;
    return;
  } else {
    startMode3Btn.disabled = false;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
  }
  
  recognition.continuous = false; 
  recognition.interimResults = false; 
  recognition.lang = "en-US"; 

  recognition.onstart = () => {
    if (currentMode !== 'mode3') return;
    isRecording = true;
    speechFeedback.textContent = "Listening... Speak now.";
    speechFeedback.classList.remove("hidden");
    startMode3Btn.classList.add("hidden");
    stopSpeechBtn.classList.remove("hidden");
  };

  recognition.onresult = (event) => {
    if (currentMode !== 'mode3') return;

    const transcript = event.results[0][0].transcript.trim();
    const activeCard = document.querySelector(".flashcard.active-for-speech");
    const currentWordData = speechFlashcardDeck[currentSpeechCardIndex];

    if (!activeCard || !currentWordData) return;

    // Expected text is the combination of Present Tense and Past Tense
    const expectedText = currentWordData.present + " " + currentWordData.past;
    
    const { accuracy } = calculateAccuracy(expectedText, transcript);
    currentSpeechWordDisplay.textContent = `You said: "${transcript}"`;

    if (accuracy / 100 >= SPEECH_RECOGNITION_THRESHOLD) {
        showToast(`Correct! Accuracy: ${accuracy}%`, "success");
        speechFeedback.textContent = `Correct! Moving to next word.`;
        
        const wordNumber = currentWordData.number;
        
        // Single step complete
        activeCard.classList.remove("active-for-speech");
        activeCard.classList.add("cleared");
        correctSpeechCount++;

        if (wordUsage[wordNumber]) {
            wordUsage[wordNumber].usedCount++;
            wordUsage[wordNumber].difficulty = Math.max(0, wordUsage[wordNumber].difficulty - 1); 
            saveWordUsage();
        }

        updateProgressBar(progressBarFillMode3, progressTextMode3, correctSpeechCount, NUM_FLASHCARDS, "Correct");
        setTimeout(loadNextSpeechFlashcard, 1500);


    } else {
        showToast(`Incorrect. Accuracy: ${accuracy}%. Try again.`, "error");
        speechFeedback.textContent = `Incorrect. Expected: "${expectedText}". Try again.`;
        
        const wordNumber = currentWordData.number;
        if (wordUsage[wordNumber]) {
            wordUsage[wordNumber].difficulty++;
            saveWordUsage();
        }

        setTimeout(() => {
            speechFeedback.textContent = `Please say the tenses for the Japanese word above.`;
            startSpeechRecognitionMode3();
        }, 1500);
    }
  };

  recognition.onerror = (event) => {
    if (currentMode !== 'mode3') return;
    
    isRecording = false; 
    stopSpeechBtn.classList.add("hidden");
    startMode3Btn.classList.remove("hidden"); 

    const activeCard = document.querySelector(".flashcard.active-for-speech");
    if (activeCard) activeCard.classList.remove("active-for-speech");

    let errorMessage = `Speech recognition error: ${event.error}.`;
    if (event.error === "no-speech") {
        errorMessage = "No speech detected. Please try again.";
    } else if (event.error === "not-allowed") {
        errorMessage = "Microphone access denied. Please allow in browser settings and restart the round.";
        startMode3Btn.disabled = true;
    } else {
        errorMessage = `Error: ${event.error}.`;
    }
    speechFeedback.textContent = errorMessage;
    speechFeedback.classList.remove("hidden");
    
    if (event.error !== "not-allowed" && correctSpeechCount < NUM_FLASHCARDS) {
        setTimeout(loadNextSpeechFlashcard, 2000);
    }
  };

  recognition.onend = () => {
    if (currentMode !== 'mode3') return;

    isRecording = false; 
    const activeCard = document.querySelector(".flashcard.active-for-speech");
    if (correctSpeechCount < NUM_FLASHCARDS && !startMode3Btn.disabled) {
        startMode3Btn.classList.remove("hidden");
        stopSpeechBtn.classList.add("hidden");
    }
    if (activeCard) activeCard.classList.remove("active-for-speech");
  };
}

function startSpeechRecognitionMode3() { 
  if (!recognition) {
    setupSpeechRecognitionForMode3();
    if (!recognition || startMode3Btn.disabled) return;
  }
  if (!isRecording) {
    recognition.start();
  }
}

function stopSpeechRecognitionMode3() { 
  if (recognition && isRecording) {
    recognition.stop();
    isRecording = false;
  }
}

function generateMode3Flashcards() {
  flashcardGridMode3.innerHTML = ""; 
  progressContainerMode3.classList.remove("hidden");
  startMode3Btn.classList.add("hidden");
  stopSpeechBtn.classList.remove("hidden");
  correctSpeechCount = 0;
  currentSpeechWord = null;
  updateProgressBar(progressBarFillMode3, progressTextMode3, correctSpeechCount, NUM_FLASHCARDS, "Correct");
  currentSpeechWordDisplay.classList.remove("hidden");
  speechFeedback.classList.remove("hidden");

  allWords.forEach((word) => (word.isUsedInCurrentRound = false));
  // Filter for words that have Present and Past Tenses listed
  const wordsWithTenses = allWords.filter(word => word.present && word.past);
  speechFlashcardDeck = selectWeightedRandomWords(wordsWithTenses, NUM_FLASHCARDS);

  if (speechFlashcardDeck.length < NUM_FLASHCARDS) {
    showToast(`Not enough words with both tenses listed (${speechFlashcardDeck.length}) to create ${NUM_FLASHCARDS} flashcards.`, "error", 5000);
    startMode3Btn.classList.remove("hidden");
    stopSpeechBtn.classList.add("hidden");
    return;
  }

  currentSpeechCardIndex = -1;
  speechRecognitionStep = 0; // Reset to 0 for the single step

  speechFlashcardDeck.forEach((word) => {
    const flashcard = document.createElement("div");
    flashcard.classList.add("flashcard");
    flashcard.dataset.id = word.number;
    // Display only the Japanese word
    flashcard.innerHTML = `<div class="flashcard-content">${word.japanese}</div>`; 
    flashcard.addEventListener("click", () => {
      // Optional: Click to reveal the answer or hear the pronunciation
      showToast(`Answer: ${word.present}, ${word.past}`, "info", 2000);
      playPronunciation(word.presentVoiceUrl); // Play the Present Tense audio on click
    });
    flashcardGridMode3.appendChild(flashcard);
  });

  loadNextSpeechFlashcard();
}

function loadNextSpeechFlashcard() {
  stopSpeechRecognitionMode3();

  speechFeedback.textContent = "";
  currentSpeechWordDisplay.textContent = "";

  const currentActiveCard = document.querySelector(".flashcard.active-for-speech");
  if (currentActiveCard) currentActiveCard.classList.remove("active-for-speech");
      
  if (correctSpeechCount === NUM_FLASHCARDS) {
    showToast("Round Complete!", "success", 3000);
    speechFeedback.textContent = "Round Complete! Click 'Start New Round' to play again.";
    stopSpeechBtn.classList.add("hidden");
    startMode3Btn.classList.remove("hidden");
    currentSpeechWordDisplay.classList.add("hidden");
    return;
  }
  
  let nextCardFound = false;
  for (let i = 0; i < speechFlashcardDeck.length; i++) {
      const cardElement = flashcardGridMode3.children[i];
      if (!cardElement.classList.contains("cleared")) {
          currentSpeechCardIndex = i;
          nextCardFound = true;
          break;
      }
  }

  if (nextCardFound) {
      const currentWordData = speechFlashcardDeck[currentSpeechCardIndex];
      const cardElement = flashcardGridMode3.children[currentSpeechCardIndex];
      
      cardElement.classList.add("active-for-speech");
      
      const promptText = `Say: "${currentWordData.present}" then "${currentWordData.past}"`;
      const wordToSpeak = currentWordData.present + " " + currentWordData.past;

      currentSpeechWordDisplay.textContent = promptText;
      currentSpeechWord = wordToSpeak; // Set the word for speech recognition comparison
      currentSpeechWordDisplay.classList.remove("hidden");
      speechFeedback.textContent = "Click 'Stop Listening' to pause.";
      
      startSpeechRecognitionMode3();
  } else if (correctSpeechCount < NUM_FLASHCARDS) {
      showToast("Error: Unable to find next card.", "error", 3000);
      stopSpeechBtn.classList.add("hidden");
      startMode3Btn.classList.remove("hidden"); 
  }
}

// ========================================
// Mode 4: Speak Mixed Present/Past Example
// ========================================

function setupSpeechRecognitionForMode4() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    speechFeedback4.textContent = "Speech recognition is not supported in your browser.";
    startMode4Btn.disabled = true;
    return;
  } else {
    startMode4Btn.disabled = false;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
  }
  
  recognition.continuous = false; 
  recognition.interimResults = false; 
  recognition.lang = "en-US";

  recognition.onstart = () => {
    if (currentMode !== 'mode4') return; 

    isRecording = true;
    speechFeedback4.textContent = "Listening... Speak now.";
    speechFeedback4.classList.remove("hidden");
    startMode4Btn.classList.add("hidden");
    stopSpeechBtn4.classList.remove("hidden");
  };

  recognition.onresult = (event) => {
    if (currentMode !== 'mode4') return;
    
    const transcript = event.results[0][0].transcript.trim();
    const activeCard = document.querySelector("#flashcard-grid-mode4 .flashcard.active-for-speech");
    const currentWordData = speechFlashcardDeck[currentSpeechCardIndex];

    if (!activeCard || !currentWordData) return;

    // The currentSpeechWord variable is set in loadNextSpeechFlashcard4
    const expectedText = currentSpeechWord; 
    const { accuracy } = calculateAccuracy(expectedText, transcript);
    currentSpeechWordDisplay4.textContent = `You said: "${transcript}"`;

    if (accuracy / 100 >= SPEECH_RECOGNITION_THRESHOLD) {
        showToast(`Correct! Accuracy: ${accuracy}%`, "success");
        speechFeedback4.textContent = `Correct! Accuracy: ${accuracy}%`;
        
        activeCard.classList.remove("active-for-speech");
        activeCard.classList.add("cleared");
        correctSpeechCount++;

        const wordNumber = currentWordData.number;
        if (wordUsage[wordNumber]) {
            wordUsage[wordNumber].usedCount++;
            wordUsage[wordNumber].difficulty = Math.max(0, wordUsage[wordNumber].difficulty - 1); 
            saveWordUsage();
        }

        updateProgressBar(progressBarFillMode4, progressTextMode4, correctSpeechCount, NUM_FLASHCARDS, "Correct");
        setTimeout(loadNextSpeechFlashcard4, 1000);

    } else {
        showToast(`Incorrect. Accuracy: ${accuracy}%. Try again.`, "error");
        speechFeedback4.textContent = `Incorrect. Expected: "${expectedText}". Try again.`;
        
        const wordNumber = currentWordData.number;
        if (wordUsage[wordNumber]) {
            wordUsage[wordNumber].difficulty++;
            saveWordUsage();
        }

        setTimeout(() => {
            speechFeedback4.textContent = "Please say the sentence above.";
            startSpeechRecognitionMode4();
        }, 1500);
    }
  };

  recognition.onerror = (event) => {
    if (currentMode !== 'mode4') return;
    
    isRecording = false; 
    stopSpeechBtn4.classList.add("hidden");
    startMode4Btn.classList.remove("hidden"); 

    const activeCard = document.querySelector("#flashcard-grid-mode4 .flashcard.active-for-speech");
    if (activeCard) activeCard.classList.remove("active-for-speech");

    let errorMessage = `Speech recognition error: ${event.error}.`;
    if (event.error === "no-speech") {
        errorMessage = "No speech detected. Please try again.";
    } else if (event.error === "not-allowed") {
        errorMessage = "Microphone access denied. Please allow in browser settings and restart the round.";
        startMode4Btn.disabled = true;
    } else {
        errorMessage = `Error: ${event.error}.`;
    }
    speechFeedback4.textContent = errorMessage;
    speechFeedback4.classList.remove("hidden");
    
    if (event.error !== "not-allowed") {
        setTimeout(loadNextSpeechFlashcard4, 2000);
    }
  };

  recognition.onend = () => {
    if (currentMode !== 'mode4') return;

    isRecording = false; 
    const activeCard = document.querySelector("#flashcard-grid-mode4 .flashcard.active-for-speech");
    if (correctSpeechCount < NUM_FLASHCARDS && !startMode4Btn.disabled) {
        startMode4Btn.classList.remove("hidden");
        stopSpeechBtn4.classList.add("hidden");
    }
    if (activeCard) {
        activeCard.classList.remove("active-for-speech");
    }
  };
}

function startSpeechRecognitionMode4() {
  if (!recognition) {
    setupSpeechRecognitionForMode4();
    if (!recognition || startMode4Btn.disabled) return;
  }
  if (!isRecording) {
    recognition.start();
  }
}

function stopSpeechRecognitionMode4() {
  if (recognition && isRecording) {
    recognition.stop();
    isRecording = false;
  }
}

function generateMode4Flashcards() {
  flashcardGridMode4.innerHTML = "";
  progressContainerMode4.classList.remove("hidden");
  startMode4Btn.classList.add("hidden");
  stopSpeechBtn4.classList.remove("hidden");
  correctSpeechCount = 0;
  currentSpeechWord = null;
  updateProgressBar(progressBarFillMode4, progressTextMode4, correctSpeechCount, NUM_FLASHCARDS, "Correct");
  currentSpeechWordDisplay4.classList.remove("hidden");
  speechFeedback4.classList.remove("hidden");

  allWords.forEach((word) => (word.isUsedInCurrentRound = false));
  const wordsWithExamples = allWords.filter(word => word.presentExample || word.pastExample);

  speechFlashcardDeck = selectWeightedRandomWords(wordsWithExamples, NUM_FLASHCARDS);

  // Add the specific example/voice data to the flashcard object for the round
  speechFlashcardDeck.forEach(word => {
    // Logic for mixed Present/Past Example
    const usePast = Math.random() < 0.5 && word.pastExample;
    
    if (usePast && word.pastExample) {
      word.mode4Display = word.pastExample;
      word.mode4Target = word.pastExample;
      word.mode4VoiceUrl = word.pastExampleVoiceUrl;
    } else if (word.presentExample) {
      // Default to present if past is not available or if random choice is present
      word.mode4Display = word.presentExample;
      word.mode4Target = word.presentExample;
      word.mode4VoiceUrl = word.presentExampleVoiceUrl;
    } else {
        // Fallback for extremely rare case where present is missing but past wasn't picked
        word.mode4Display = word.pastExample || "Example Missing";
        word.mode4Target = word.pastExample || "";
        word.mode4VoiceUrl = word.pastExampleVoiceUrl || null;
    }
  });


  if (speechFlashcardDeck.length < NUM_FLASHCARDS) {
    showToast(`Not enough words with example sentences (${speechFlashcardDeck.length}) for a full round.`, "error", 5000);
    startMode4Btn.classList.remove("hidden"); 
    stopSpeechBtn4.classList.add("hidden");
    return;
  }

  currentSpeechCardIndex = -1;
  speechFlashcardDeck.forEach((word) => {
    const flashcard = document.createElement("div");
    flashcard.classList.add("flashcard");
    flashcard.dataset.id = word.number;
    // Display the randomly selected example sentence
    flashcard.innerHTML = `<div class="flashcard-content">${word.mode4Display}</div>`; 
    flashcard.addEventListener("click", () => {
      // Click plays the corresponding pronunciation
      playPronunciation(word.mode4VoiceUrl);
    });
    flashcardGridMode4.appendChild(flashcard);
  });

  loadNextSpeechFlashcard4();
}

function loadNextSpeechFlashcard4() {
  stopSpeechRecognitionMode4();

  speechFeedback4.textContent = "";
  currentSpeechWordDisplay4.textContent = "";

  const currentActiveCard = document.querySelector("#flashcard-grid-mode4 .flashcard.active-for-speech");
  if (currentActiveCard) {
    currentActiveCard.classList.remove("active-for-speech");
  }

  if (correctSpeechCount === NUM_FLASHCARDS) {
    showToast("Round Complete!", "success", 3000);
    speechFeedback4.textContent = "Round Complete! Click 'Start New Round' to play again.";
    stopSpeechBtn4.classList.add("hidden");
    startMode4Btn.classList.remove("hidden"); 
    currentSpeechWordDisplay4.classList.add("hidden");
    return;
  }

  let nextCardFound = false;
  for (let i = 0; i < speechFlashcardDeck.length; i++) {
    const cardElement = flashcardGridMode4.children[i];
    if (!cardElement.classList.contains("cleared")) {
      currentSpeechCardIndex = i;
      // Set target to the randomly selected example sentence
      currentSpeechWord = speechFlashcardDeck[i].mode4Target; 

      cardElement.classList.add("active-for-speech");
      currentSpeechWordDisplay4.textContent = `Read the sentence above.`; 
      currentSpeechWordDisplay4.classList.remove("hidden");
      speechFeedback4.textContent = "Click 'Stop Listening' to pause.";

      startSpeechRecognitionMode4(); 
      nextCardFound = true;
      break;
    }
  }

  if (!nextCardFound && correctSpeechCount < NUM_FLASHCARDS) {
      showToast("Error: Card deck issue.", "error", 3000);
      stopSpeechBtn4.classList.add("hidden");
      startMode4Btn.classList.remove("hidden");
  }
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  loadWordUsage(); 

  // Listen for changes in the system's preferred color scheme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      if (localStorage.getItem("darkMode") === null) {
          if (event.matches) {
              document.documentElement.classList.add("dark-mode");
          } else {
              document.documentElement.classList.remove("dark-mode");
          }
      }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const listUrl = urlParams.get('list');
  
  if (listUrl) {
    wordFileUrlInput.value = listUrl;
    loadWords(); 
  } else {
    configSection.classList.remove("hidden");
    loadStatusElement.textContent = "Please load a word list to begin.";
    loadStatusElement.classList.remove("hidden");
  }
});

loadWordsBtn.addEventListener("click", () => {
  loadWords();
});

mode1Btn.addEventListener("click", () => activateMode("mode1", mode1Btn));
mode2Btn.addEventListener("click", () => activateMode("mode2", mode2Btn));
mode3Btn.addEventListener("click", () => activateMode("mode3", mode3Btn));
mode4Btn.addEventListener("click", () => activateMode("mode4", mode4Btn)); 

startMode2Btn.addEventListener("click", generateMode2Flashcards);
startMode3Btn.addEventListener("click", generateMode3Flashcards);
stopSpeechBtn.addEventListener("click", stopSpeechRecognitionMode3);

startMode4Btn.addEventListener("click", generateMode4Flashcards); 
stopSpeechBtn4.addEventListener("click", stopSpeechRecognitionMode4); 

modalCloseBtn.addEventListener("click", hideModal);
appModal.addEventListener("click", (event) => {
  if (event.target === appModal) {
    hideModal();
  }
});