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

// Mode Sections (kept as references to their original DOM location)
const mode1Section = document.getElementById("mode1");
const mode2Section = document.getElementById("mode2");
const mode3Section = document.getElementById("mode3");

// Mode 1 Elements
const wordListTableBody = document.querySelector("#word-list-table tbody");

// Mode 2 Elements
const flashcardGridMode2 = document.getElementById("flashcard-grid-mode2");
const startMode2Btn = document.getElementById("startMode2Btn");
const progressContainerMode2 = document.getElementById(
	"progress-container-mode2"
);
const progressTextMode2 = document.getElementById("progress-text-mode2");
const progressBarFillMode2 = document.getElementById("progress-bar-fill-mode2");

// Mode 3 Elements
const flashcardGridMode3 = document.getElementById("flashcard-grid-mode3");
const startMode3Btn = document.getElementById("startMode3Btn");
const stopSpeechBtn = document.getElementById("stopSpeechBtn");
const currentSpeechWordDisplay = document.getElementById(
	"currentSpeechWordDisplay"
);
const speechFeedback = document.getElementById("speechFeedback");
const progressContainerMode3 = document.getElementById(
	"progress-container-mode3"
);
const progressTextMode3 = document.getElementById("progress-text-mode3");
const progressBarFillMode3 = document.getElementById(
	"progress-bar-fill-mode3"
); /* FIX: Corrected ID */

// ========================================
// Global Variables
// ========================================
let allWords = []; // Stores the loaded word list
let wordUsage = {}; // Stores usage and difficulty data from localStorage
const NUM_FLASHCARDS = 10; // Number of flashcards per round
const FLASHCARD_MATCH_DELAY_MS = 1000; // How long matched cards stay visible before disappearing
const SPEECH_RECOGNITION_THRESHOLD = 0.7; // Accuracy threshold for speech matching (0.0 to 1.0)

let currentMode = null; // Tracks the active mode, null when no modal is open

// Mode 2 specific
let selectedCards = []; // For Mode 2 matching game
let matchedPairs = 0; // For Mode 2 progress

// Mode 3 specific
let recognition; // Web Speech Recognition object for Mode 3
let isRecording = false; // Tracks if speech recognition is active
let currentSpeechWord = null; // Stores the English word expected in Mode 3
let correctSpeechCount = 0; // For Mode 3 progress
let speechFlashcardDeck = []; // Words for the current Mode 3 round
let currentSpeechCardIndex = -1; // Index of the current word in Mode 3 deck

// ========================================
// Utility Functions
// ========================================

/**
 * Displays a toast notification.
 * @param {string} message - The message to display.
 * @param {'success' | 'error' | 'info'} type - Type of toast (influences color).
 * @param {number} duration - How long the toast should be visible in ms.
 */
function showToast(message, type = "info", duration = 3000) {
	const toast = document.createElement("div");
	toast.classList.add("toast", type);
	toast.textContent = message;
	toastContainer.appendChild(toast);

	// Trigger reflow to enable transition
	void toast.offsetWidth;
	toast.classList.add("show");

	setTimeout(() => {
		toast.classList.remove("show");
		toast.addEventListener("transitionend", () => toast.remove(), {
			once: true,
		});
	}, duration);
}

/**
 * Plays the pronunciation of a word.
 * @param {string} url - The URL of the voice file.
 */
function playPronunciation(url) {
	if (url) {
		audioPlayer.src = url;
		audioPlayer.play().catch((e) => console.error("Error playing audio:", e));
	} else {
		showToast("No voice file available for this word.", "info", 2000);
	}
}

/**
 * Saves word usage data to localStorage.
 */
function saveWordUsage() {
	localStorage.setItem("wordUsage", JSON.stringify(wordUsage));
}

/**
 * Initializes word usage data for newly loaded words.
 */
function initializeWordUsage() {
	allWords.forEach((word) => {
		if (!wordUsage[word.number]) {
			wordUsage[word.number] = { usedCount: 0, difficulty: 0 };
		}
	});
	saveWordUsage(); // Save any new initializations
}

/**
 * Loads word usage data from localStorage.
 */
function loadWordUsage() {
	const savedUsage = localStorage.getItem("wordUsage");
	if (savedUsage) {
		wordUsage = JSON.parse(savedUsage);
	}
}

/**
 * Updates the progress bar.
 * @param {HTMLElement} progressBarFillEl - The fill element of the progress bar.
 * @param {HTMLElement} progressTextEl - The text element displaying progress.
 * @param {number} current - Current progress count.
 * @param {number} total - Total count.
 * @param {string} unit - Unit to display (e.g., "Matched", "Correct").
 */
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

/**
 * Weighted random selection of words.
 * Prioritizes words with higher difficulty and lower usage.
 * @param {Array<Object>} words - The array of word objects.
 * @param {number} count - Number of words to select.
 * @returns {Array<Object>} Selected words.
 */
function selectWeightedRandomWords(words, count) {
	if (words.length === 0) return [];
	if (words.length <= count) return [...words]; // If fewer words than requested, return all unique

	const availableWords = words.filter((word) => {
		const usageData = wordUsage[word.number];
		return usageData && !word.isUsedInCurrentRound; // Ensure not already used in this specific round
	});

	if (availableWords.length < count) {
		// If not enough unique words left, reset usage for all words to allow selection
		// This prevents the game from getting stuck if all words are "used"
		allWords.forEach((word) => (word.isUsedInCurrentRound = false));
		return selectWeightedRandomWords(words, count); // Retry with reset
	}

	// Calculate weights
	const weightedWords = availableWords.map((word) => {
		const usageData = wordUsage[word.number] || { usedCount: 0, difficulty: 0 };
		let weight = 1.0;

		// Decrease weight for higher usage (more used = lower chance)
		weight /= usageData.usedCount + 1; // Add 1 to avoid division by zero

		// Increase weight for higher difficulty
		weight *= usageData.difficulty + 1;

		return { word, weight: Math.max(0.1, weight) }; // Ensure minimum weight
	});

	// Create a cumulative weight array for efficient selection
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
					// Mark as used for this round to prevent immediate re-selection
					wordToAdd.isUsedInCurrentRound = true;
					// Rebuild cumulative weights for remaining words if you want to
					// ensure unique selection within this call. For simplicity,
					// we'll just rely on the Set to prevent duplicates.
				}
				break;
			}
		}
	}
	return Array.from(selected);
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
	if (savedTheme === "true") {
		document.documentElement.classList.add("dark-mode");
	} else {
		document.documentElement.classList.remove("dark-mode");
	}
}

// ========================================
// Word Loading
// ========================================

/**
 * Loads the word list from the specified URL.
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
		// Expected format: number,English,Japanese,voice_url
		allWords = text
			.split("\n")
			.filter((line) => line.trim() !== "")
			.map((line) => {
				const parts = line.split(",");
				if (parts.length === 4) {
					return {
						number: parseInt(parts[0].trim()),
						english: parts[1].trim(),
						japanese: parts[2].trim(),
						voiceUrl: parts[3].trim(),
						isUsedInCurrentRound: false, // Helper for weighted selection
					};
				}
				return null; // Ignore malformed lines
			})
			.filter((word) => word !== null);

		if (allWords.length === 0) {
			showToast("No words found in the file or invalid format.", "error");
			loadStatusElement.textContent = "Failed to load words: No words found.";
			return;
		}

		initializeWordUsage(); // Initialize or update usage data for loaded words
		showToast(`Successfully loaded ${allWords.length} words!`, "success");
		loadStatusElement.textContent = `Loaded ${allWords.length} words.`;
		configSection.classList.add("hidden"); // Hide the configuration section on successful load
		// Removed: activateMode('mode1', mode1Btn); // No longer defaults to Mode 1
	} catch (error) {
		console.error("Error loading words:", error);
		showToast(`Failed to load words: ${error.message}`, "error");
		loadStatusElement.textContent = `Failed to load words: ${error.message}`;
	} finally {
		loadWordsBtn.disabled = false;
	}
}

// ========================================
// Modal & Mode Switching
// ========================================

/**
 * Hides all mode sections by moving them back to their original hidden state.
 * Also stops any ongoing processes.
 */
function hideAllModes() {
	// Move current content back to its original hidden location
	if (currentMode === "mode1") {
		document.body.appendChild(mode1Section);
	} else if (currentMode === "mode2") {
		document.body.appendChild(mode2Section);
	} else if (currentMode === "mode3") {
		document.body.appendChild(mode3Section);
	}
	// Ensure all mode sections are hidden in their original positions
	mode1Section.classList.add("hidden");
	mode2Section.classList.add("hidden");
	mode3Section.classList.add("hidden");

	document.querySelectorAll("#mode-selection button").forEach((button) => {
		button.classList.remove("active");
	});
	// Stop any ongoing speech or recognition when switching modes
	if (audioPlayer) audioPlayer.pause();
	stopSpeechRecognitionMode3(); // Ensure STT is stopped
}

/**
 * Displays a mode's content within the modal overlay.
 * @param {HTMLElement} modeElement - The HTML element of the mode section to display.
 */
function showModeInModal(modeElement) {
	modalContentArea.innerHTML = ""; // Clear previous modal content
	modalContentArea.appendChild(modeElement); // Move the mode section into the modal
	modeElement.classList.remove("hidden"); // Make it visible inside the modal
	appModal.classList.remove("hidden"); // Show the modal itself
}

/**
 * Hides the modal and performs cleanup for the currently active mode.
 */
function hideModal() {
	appModal.classList.add("hidden"); // Hide the modal overlay
	// Perform cleanup based on the mode that was active
	if (currentMode === "mode2") {
		flashcardGridMode2.innerHTML = ""; // Clear flashcards
		selectedCards = [];
		matchedPairs = 0;
		progressContainerMode2.classList.add("hidden");
		startMode2Btn.classList.remove("hidden"); // Show start button for next time
	} else if (currentMode === "mode3") {
		flashcardGridMode3.innerHTML = ""; // Clear flashcards
		stopSpeechRecognitionMode3(); // Ensure STT is stopped
		correctSpeechCount = 0;
		currentSpeechWord = null;
		currentSpeechWordDisplay.classList.add("hidden");
		speechFeedback.classList.add("hidden");
		progressContainerMode3.classList.add("hidden");
		startMode3Btn.classList.remove("hidden"); // Show start button for next time
		stopSpeechBtn.classList.add("hidden"); // Hide stop button
	}
	// Move the content back to its original hidden place in the DOM
	hideAllModes(); // This function now handles moving content back and hiding it
	currentMode = null; // No mode is active in the modal
}

/**
 * Activates a specific mode by showing its content in the modal.
 * @param {string} modeId - The ID of the mode section to display (e.g., 'mode1').
 * @param {HTMLElement} buttonElement - The button element corresponding to the mode.
 */
function activateMode(modeId, buttonElement) {
	if (allWords.length === 0 && modeId !== "mode1") {
		showToast("Please load words first using the 'Load Words' button.", "info");
		return;
	}

	// If a modal is already open, close it first to clean up previous mode
	if (currentMode !== null) {
		hideModal(); // This will also call hideAllModes and stop processes
	}

	// Set the new current mode before showing it in the modal
	currentMode = modeId;

	// Highlight the active mode button
	document.querySelectorAll("#mode-selection button").forEach((btn) => {
		btn.classList.remove("active");
	});
	buttonElement.classList.add("active");

	// Show the selected mode's content in the modal
	if (modeId === "mode1") {
		showModeInModal(mode1Section);
		displayMode1(); // Populate the list
	} else if (modeId === "mode2") {
		showModeInModal(mode2Section);
		// No immediate generation, wait for 'Start New Round' button click
	} else if (modeId === "mode3") {
		showModeInModal(mode3Section);
		setupSpeechRecognitionForMode3(); // Setup recognition for this mode
		// No immediate generation, wait for 'Start New Round' button click
	}
}

// ========================================
// Mode 1: Full Word List
// ========================================

function displayMode1() {
	wordListTableBody.innerHTML = ""; // Clear previous entries

	if (allWords.length === 0) {
		wordListTableBody.innerHTML =
			'<tr><td colspan="5">No words loaded. Please load a word file.</td></tr>';
		return;
	}

	allWords.forEach((word) => {
		const row = wordListTableBody.insertRow();
		const usageData = wordUsage[word.number] || { usedCount: 0, difficulty: 0 };

		row.insertCell().textContent = word.number;
		const englishCell = row.insertCell();
		englishCell.textContent = word.english;
		englishCell.classList.add("clickable-english"); // Add class for styling and click event
		englishCell.style.cursor = "pointer"; // Indicate clickability
		englishCell.addEventListener("click", () =>
			playPronunciation(word.voiceUrl)
		);

		row.insertCell().textContent = word.japanese;
		const listenCell = row.insertCell();
		const listenButton = document.createElement("button");
		listenButton.textContent = "Listen";
		listenButton.classList.add("button-group"); // Apply button styling
		listenButton.onclick = () => playPronunciation(word.voiceUrl);
		listenCell.appendChild(listenButton);

		row.insertCell().textContent = `Used: ${usageData.usedCount}, Diff: ${usageData.difficulty}`;
	});
}

// ========================================
// Mode 2: Matching Flashcards
// ========================================

function generateMode2Flashcards() {
	flashcardGridMode2.innerHTML = ""; // Clear existing cards
	progressContainerMode2.classList.remove("hidden");
	startMode2Btn.classList.add("hidden");
	selectedCards = [];
	matchedPairs = 0;
	updateProgressBar(
		progressBarFillMode2,
		progressTextMode2,
		matchedPairs,
		NUM_FLASHCARDS,
		"Matched"
	);

	// Reset 'isUsedInCurrentRound' for all words before selecting
	allWords.forEach((word) => (word.isUsedInCurrentRound = false));

	const wordsForRound = selectWeightedRandomWords(allWords, NUM_FLASHCARDS);

	if (wordsForRound.length < NUM_FLASHCARDS) {
		showToast(
			`Not enough unique words (${wordsForRound.length}) to create ${NUM_FLASHCARDS} flashcards. Please add more words or reset usage data.`,
			"error",
			5000
		);
		startMode2Btn.classList.remove("hidden"); // Show button to retry
		return;
	}

	let cards = [];
	wordsForRound.forEach((word) => {
		// Use word.number as the unique ID for matching pairs
		cards.push({
			id: word.number,
			type: "english",
			content: word.english,
			voiceUrl: word.voiceUrl,
		});
		cards.push({ id: word.number, type: "japanese", content: word.japanese });
	});

	// Shuffle the cards
	cards.sort(() => 0.5 - Math.random());

	cards.forEach((cardData) => {
		const flashcard = document.createElement("div");
		flashcard.classList.add("flashcard");
		flashcard.dataset.id = cardData.id; // Common ID for the pair
		flashcard.dataset.type = cardData.type; // 'english' or 'japanese'
		flashcard.innerHTML = `<div class="flashcard-content">${cardData.content}</div>`;

		if (cardData.type === "english") {
			flashcard.addEventListener("click", () => {
				playPronunciation(cardData.voiceUrl);
				handleFlashcardClickMode2(flashcard);
			});
		} else {
			flashcard.addEventListener("click", () =>
				handleFlashcardClickMode2(flashcard)
			);
		}
		flashcardGridMode2.appendChild(flashcard);
	});
}

function handleFlashcardClickMode2(clickedCard) {
	// Ignore clicks on already cleared or selected cards, or if two cards are already flipped
	if (
		clickedCard.classList.contains("cleared") ||
		clickedCard.classList.contains("match-selected") ||
		selectedCards.length === 2
	) {
		return;
	}

	clickedCard.classList.add("match-selected"); // Visually mark as selected
	selectedCards.push(clickedCard);

	if (selectedCards.length === 2) {
		const [card1, card2] = selectedCards;

		// Disable further clicks until match check is done
		flashcardGridMode2.style.pointerEvents = "none";

		// Check if they are a matching pair (same ID, different types)
		if (
			card1.dataset.id === card2.dataset.id &&
			card1.dataset.type !== card2.dataset.type
		) {
			// Match found!
			showToast("Match!", "success", 1000);
			card1.classList.remove("match-selected");
			card2.classList.remove("match-selected");
			card1.classList.add("cleared"); // Mark as cleared
			card2.classList.add("cleared"); // Mark as cleared

			matchedPairs++;
			updateProgressBar(
				progressBarFillMode2,
				progressTextMode2,
				matchedPairs,
				NUM_FLASHCARDS,
				"Matched"
			);

			// Update usage/difficulty for the matched word
			const wordNumber = parseInt(card1.dataset.id);
			if (wordUsage[wordNumber]) {
				wordUsage[wordNumber].usedCount++;
				// Decrease difficulty if matched correctly
				wordUsage[wordNumber].difficulty = Math.max(
					0,
					wordUsage[wordNumber].difficulty - 1
				);
				saveWordUsage();
			}

			if (matchedPairs === NUM_FLASHCARDS) {
				setTimeout(() => {
					showToast("Round Complete! Starting a new round...", "info", 2000);
					generateMode2Flashcards(); // Start a new round automatically
				}, 1000);
			} else {
				// Reset for next selection immediately if not end of round
				selectedCards = [];
				flashcardGridMode2.style.pointerEvents = "auto"; // Re-enable clicks
			}
		} else {
			// No match
			showToast("No match. Try again!", "error", 1000);
			// Increment difficulty for the incorrect words
			selectedCards.forEach((card) => {
				const wordNumber = parseInt(card.dataset.id);
				if (wordUsage[wordNumber]) {
					wordUsage[wordNumber].difficulty++;
					saveWordUsage();
				}
			});

			setTimeout(() => {
				card1.classList.remove("match-selected");
				card2.classList.remove("match-selected");
				selectedCards = []; // Reset for next selection
				flashcardGridMode2.style.pointerEvents = "auto"; // Re-enable clicks
			}, FLASHCARD_MATCH_DELAY_MS);
		}
	}
}

// ========================================
// Mode 3: Speak and Check Flashcards
// ========================================

/**
 * Levenshtein Distance function for comparing strings.
 * @param {string} s - First string.
 * @param {string} t - Second string.
 * @returns {number} The Levenshtein distance.
 */
function levenshteinDistance(s, t) {
	if (!s.length) return t.length;
	if (!t.length) return s.length;
	const matrix = Array(t.length + 1)
		.fill(null)
		.map(() => Array(s.length + 1).fill(null));
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

/**
 * Normalizes text for comparison (lowercase, remove punctuation, trim).
 * @param {string} text - The input text.
 * @returns {string} Normalized text.
 */
function normalizeText(text) {
	return text
		.toLowerCase()
		.replace(/[.,!?;:]/g, "")
		.trim();
}

/**
 * Calculates accuracy between original and recognized text using Levenshtein distance.
 * @param {string} originalText - The expected text.
 * @param {string} recognizedText - The text from speech recognition.
 * @returns {{accuracy: number, troublesomeWords: string[]}} Accuracy percentage and list of troublesome words.
 */
function calculateAccuracy(originalText, recognizedText) {
	const normOriginal = normalizeText(originalText);
	const normRecognized = normalizeText(recognizedText);
	if (!normOriginal) return { accuracy: 0, troublesomeWords: [] };
	if (!normRecognized)
		return {
			accuracy: 0,
			troublesomeWords: normOriginal.split(/\s+/).filter(Boolean),
		};

	const distance = levenshteinDistance(normOriginal, normRecognized);
	const maxLength = Math.max(normOriginal.length, normRecognized.length);
	const accuracy = Math.round(
		(maxLength === 0 ? 1 : 1 - distance / maxLength) * 100
	);

	const originalWords = normOriginal.split(/\s+/).filter(Boolean);
	const recognizedWordSet = new Set(
		normRecognized.split(/\s+/).filter(Boolean)
	);
	const troublesomeWords = originalWords.filter(
		(word) => !recognizedWordSet.has(word)
	);

	return { accuracy, troublesomeWords };
}

/**
 * Sets up or reconfigures SpeechRecognition specifically for Mode 3.
 */
function setupSpeechRecognitionForMode3() {
	if (!("webkitSpeechRecognition" in window)) {
		speechFeedback.textContent =
			"Speech recognition is not supported in your browser. Please use Chrome.";
		startMode3Btn.disabled = true;
		return;
	}

	if (!recognition) {
		const SpeechRecognition = window.webkitSpeechRecognition;
		recognition = new SpeechRecognition();
	}

	recognition.continuous = false; // Only get one result per recognition session
	recognition.interimResults = false; // We want final result for checking
	recognition.lang = "en-US"; // Always English for this mode's check

	recognition.onstart = () => {
		isRecording = true;
		speechFeedback.textContent = "Listening... Speak now.";
		speechFeedback.classList.remove("hidden");
		startMode3Btn.classList.add("hidden");
		stopSpeechBtn.classList.remove("hidden");
		// Highlight the active card
		const activeCard = document.querySelector(".flashcard.active-for-speech");
		if (!activeCard) {
			// If no active card, find the next one
			loadNextSpeechFlashcard();
		}
	};

	recognition.onresult = (event) => {
		const transcript = event.results[0][0].transcript.toLowerCase().trim();
		const confidence = event.results[0][0].confidence;
		console.log("Recognized:", transcript, "Confidence:", confidence);

		const activeCard = document.querySelector(".flashcard.active-for-speech");
		if (activeCard && currentSpeechWord) {
			const expectedEnglish = normalizeText(currentSpeechWord);
			const { accuracy } = calculateAccuracy(expectedEnglish, transcript);

			currentSpeechWordDisplay.textContent = `You said: "${transcript}"`;

			if (accuracy / 100 >= SPEECH_RECOGNITION_THRESHOLD) {
				showToast(`Correct! Accuracy: ${accuracy}%`, "success");
				speechFeedback.textContent = `Correct! Accuracy: ${accuracy}%`;
				activeCard.classList.remove("active-for-speech");
				activeCard.classList.add("cleared"); // Mark as cleared
				correctSpeechCount++;
				updateProgressBar(
					progressBarFillMode3,
					progressTextMode3,
					correctSpeechCount,
					NUM_FLASHCARDS,
					"Correct"
				);

				// Update usage and decrease difficulty
				const wordNumber = parseInt(activeCard.dataset.id);
				if (wordUsage[wordNumber]) {
					wordUsage[wordNumber].usedCount++;
					wordUsage[wordNumber].difficulty = Math.max(
						0,
						wordUsage[wordNumber].difficulty - 1
					); // Decrease difficulty
					saveWordUsage();
				}
				// Move to next card after a short delay
				setTimeout(loadNextSpeechFlashcard, 1000);
			} else {
				showToast(`Incorrect. Accuracy: ${accuracy}%. Try again.`, "error");
				speechFeedback.textContent = `Incorrect. Accuracy: ${accuracy}%. Expected: "${currentSpeechWord}"`;
				// Increment difficulty
				const wordNumber = parseInt(activeCard.dataset.id);
				if (wordUsage[wordNumber]) {
					wordUsage[wordNumber].difficulty++;
					saveWordUsage();
				}
				// Optionally, auto-retry or wait for user to click start again
				setTimeout(() => {
					speechFeedback.textContent = "Please say the word above."; // Reset prompt
					startSpeechRecognitionMode3(); // Auto-retry
				}, 1500);
			}
		}
	};

	recognition.onerror = (event) => {
		isRecording = false; // Set to false on error
		stopSpeechBtn.classList.add("hidden");
		startMode3Btn.classList.remove("hidden"); // Show start button again
		const activeCard = document.querySelector(".flashcard.active-for-speech");
		if (activeCard) {
			activeCard.classList.remove("active-for-speech");
		}

		let errorMessage = `Speech recognition error: ${event.error}`;
		if (event.error === "no-speech") {
			errorMessage = "No speech detected. Please try again.";
		} else if (event.error === "not-allowed") {
			errorMessage =
				"Microphone access denied. Please allow in browser settings.";
			showToast(
				"Microphone access denied. Please enable it in your browser settings.",
				"error",
				5000
			);
			startMode3Btn.disabled = true; // Disable if permission denied
		} else {
			errorMessage = `Error: ${event.error}`;
		}
		speechFeedback.textContent = errorMessage;
		speechFeedback.classList.remove("hidden");
		console.error("Speech recognition error:", event.error);

		// If an error occurs, try to advance to the next card after a delay
		setTimeout(loadNextSpeechFlashcard, 2000);
	};

	recognition.onend = () => {
		isRecording = false; // Set to false on end
		// If not all cards are cleared, show start button to continue
		if (correctSpeechCount < NUM_FLASHCARDS) {
			startMode3Btn.classList.remove("hidden");
			stopSpeechBtn.classList.add("hidden");
		}
		const activeCard = document.querySelector(".flashcard.active-for-speech");
		if (activeCard) {
			activeCard.classList.remove("active-for-speech");
		}
	};
}

/**
 * Starts the speech recognition for Mode 3.
 */
function startSpeechRecognitionMode3() {
	if (!recognition) {
		setupSpeechRecognitionForMode3();
		if (!recognition) return; // If setup failed, exit
	}
	if (!isRecording) {
		recognition.start();
	}
}

/**
 * Stops the speech recognition for Mode 3.
 */
function stopSpeechRecognitionMode3() {
	if (recognition && isRecording) {
		recognition.stop();
		isRecording = false; // Explicitly set to false immediately
	}
}

/**
 * Generates and initializes flashcards for the Speak & Check mode.
 */
function generateMode3Flashcards() {
	flashcardGridMode3.innerHTML = ""; // Clear existing cards
	progressContainerMode3.classList.remove("hidden");
	startMode3Btn.classList.add("hidden");
	stopSpeechBtn.classList.remove("hidden");
	correctSpeechCount = 0;
	currentSpeechWord = null;
	updateProgressBar(
		progressBarFillMode3,
		progressTextMode3,
		correctSpeechCount,
		NUM_FLASHCARDS,
		"Correct"
	);
	currentSpeechWordDisplay.classList.remove("hidden");
	speechFeedback.classList.remove("hidden");

	// Reset 'isUsedInCurrentRound' for all words before selecting
	allWords.forEach((word) => (word.isUsedInCurrentRound = false));

	speechFlashcardDeck = selectWeightedRandomWords(allWords, NUM_FLASHCARDS);

	if (speechFlashcardDeck.length < NUM_FLASHCARDS) {
		showToast(
			`Not enough unique words (${speechFlashcardDeck.length}) to create ${NUM_FLASHCARDS} flashcards. Please add more words or reset usage data.`,
			"error",
			5000
		);
		startMode3Btn.classList.remove("hidden"); // Show button to retry
		stopSpeechBtn.classList.add("hidden");
		return;
	}

	currentSpeechCardIndex = -1; // Reset index for the new round

	speechFlashcardDeck.forEach((word) => {
		const flashcard = document.createElement("div");
		flashcard.classList.add("flashcard");
		flashcard.dataset.id = word.number;
		flashcard.dataset.english = word.english; // Store English for comparison
		flashcard.dataset.voiceUrl = word.voiceUrl;

		// Display Japanese, user speaks English
		flashcard.innerHTML = `<div class="flashcard-content">${word.japanese}</div>
                                       <div class="flashcard-translation hidden">${word.english}</div>`; // Hidden for initial prompt

		// Click to hear English pronunciation
		flashcard.addEventListener("click", () => {
			playPronunciation(word.voiceUrl);
			// Optionally, reveal English temporarily
			const translationDiv = flashcard.querySelector(".flashcard-translation");
			if (translationDiv) {
				translationDiv.classList.remove("hidden");
				setTimeout(() => translationDiv.classList.add("hidden"), 2000);
			}
		});

		flashcardGridMode3.appendChild(flashcard);
	});

	loadNextSpeechFlashcard(); // Display the first card and start listening
}

/**
 * Loads and displays the next word for the user to speak in Mode 3.
 * Automatically starts speech recognition if not already active.
 */
function loadNextSpeechFlashcard() {
	const remainingCards = Array.from(
		flashcardGridMode3.querySelectorAll(".flashcard:not(.cleared)")
	);
	flashcardGridMode3
		.querySelectorAll(".flashcard")
		.forEach((card) => card.classList.remove("active-for-speech"));

	if (remainingCards.length > 0) {
		currentSpeechCardIndex++; // Advance the index
		const nextCard = remainingCards[0]; // Always take the first uncleared card
		nextCard.classList.add("active-for-speech");
		currentSpeechWord = nextCard.dataset.english;
		currentSpeechWordDisplay.textContent = `Say: "${currentSpeechWord}"`;
		speechFeedback.textContent = "Listening... Speak now.";
		startSpeechRecognitionMode3(); // Start listening for the new word
	} else {
		showToast("Round Complete! Starting a new round...", "info", 2000);
		setTimeout(generateMode3Flashcards, 1000); // Start a new round automatically
	}
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener("DOMContentLoaded", () => {
	applyTheme(); // Apply saved theme on load
	loadWordUsage(); // Load word usage data from localStorage

	// Try to load a default URL or a previously saved one
	const savedUrl = localStorage.getItem("lastWordFileUrl");
	if (savedUrl) {
		wordFileUrlInput.value = savedUrl;
	} else {
		// Default placeholder for a word list
		wordFileUrlInput.value =
			"assets/words.csv";
	}

	// Load words automatically if a URL is present
	if (wordFileUrlInput.value) {
		loadWords();
	}
});

loadWordsBtn.addEventListener("click", () => {
	localStorage.setItem("lastWordFileUrl", wordFileUrlInput.value); // Save the URL
	loadWords();
});

// Mode selection buttons
mode1Btn.addEventListener("click", () => activateMode("mode1", mode1Btn));
mode2Btn.addEventListener("click", () => activateMode("mode2", mode2Btn));
mode3Btn.addEventListener("click", () => activateMode("mode3", mode3Btn));

// Modal close button
modalCloseBtn.addEventListener("click", hideModal);

// Mode 2 specific
startMode2Btn.addEventListener("click", generateMode2Flashcards);

// Mode 3 specific
startMode3Btn.addEventListener("click", generateMode3Flashcards); // Start a new round of mode 3
stopSpeechBtn.addEventListener("click", stopSpeechRecognitionMode3);

// script.js content ends here
