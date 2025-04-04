'use client';

import React, { useEffect, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

const LANG_URL = 'https://ltl-school.info/wp-json/ltl/v1/pronun/lang/zh-CN';
const preferredLanguage = "zh-CN";
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

interface Chapter {
  topics: {
    phrases: string[][];
    label: string;
  }[];
}

const Trainer = () => {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [levelJSON, setLevelJSON] = useState<any | null>(null);
  const [currentLevelPointer, setCurrentLevelPointer] = useState(0);
  const [currentPhrasePointer, setCurrentPhrasePointer] = useState(0);
  const [currentTopicPointer, setCurrentTopicPointer] = useState(1);
  const [actualPhrase, setActualPhrase] = useState<string | null>(null);
  const [judgementMessage, setJudgementMessage] = useState<string | null>(null);
  const [characterComparison, setCharacterComparison] = useState<Array<{ char: string, correct: boolean }> | null>(null);
  const [isClient, setIsClient] = useState(false);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  useEffect(() => {
    // Ensure this code runs only on the client side
    setIsClient(true);
  }, []);

  useEffect(() => {
    async function fetchLevels() {
      const response = await fetch(LANG_URL);
      const data = await response.json();
      setLevelJSON(data);
    }
    fetchLevels();
  }, []);

  useEffect(() => {
    if (!levelJSON || !levelJSON.levels) return;

    const currentLevel = levelJSON.levels[currentLevelPointer];
    const chapterIds = currentLevel?.chapter_ids;
    if (!chapterIds || chapterIds.length === 0) return;

    // Fetch all chapters concurrently
    Promise.all(
      chapterIds.map((id: string) =>
        fetch(`https://ltl-school.info/wp-json/ltl/v1/pronun/chapter/${id}`).then((res) =>
          res.json()
        )
      )
    )
      .then((chapters) => {
        const aggregatedTopics = chapters.reduce((acc: [], chapter: { title: any; topics: any }) => {
          const heading = { phrases: [], label: chapter.title, length: 0 };
          const topics = [heading, ...chapter.topics];
          return [...acc, ...topics];
        }, []);
        setChapter({ topics: aggregatedTopics });
      })
      .catch((err) => console.error("Error fetching chapters:", err));
  }, [levelJSON, currentLevelPointer]);

  const levelChapters = React.useMemo(() => {
    if (!levelJSON || !levelJSON.levels) return [];
    return levelJSON.levels.map((level: any) => ({
      name: level.name,
      slug: level.slug,
      chapter_ids: level.chapter_ids,
    }));
  }, [levelJSON]);

  const currentTopic = chapter?.topics?.[currentTopicPointer];
  const currentPhrase = React.useMemo(() => {
    const topic = chapter?.topics?.[currentTopicPointer];
    const phrase = topic?.phrases?.[currentPhrasePointer] || [];
    return phrase.map((p: string) => p.replace(/<[^>]*>/g, '')); // Remove HTML tags
  }, [chapter, currentTopicPointer, currentPhrasePointer]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      SpeechRecognition.stopListening();
    };
  }, []);

  const resetAttempt = () => {
    setCharacterComparison(null);
    setJudgementMessage(null);
    resetTranscript()
    setActualPhrase(null);
  }

  const startListening = () => {
    console.log("Listening started");
    resetAttempt();
    SpeechRecognition.startListening({ continuous: false, language: preferredLanguage });
  };

  const stopListening = () => {
    console.log("Listening stopped");
    SpeechRecognition.stopListening();
  };

  useEffect(() => {
    if (!listening && transcript) {
      console.log({ transcript });

      if (currentPhrase && currentPhrase.length > 0) {
        const normalizedPhrase = normalizePhrase(currentPhrase[0]);
        const normalizedTranscript = normalizePhrase(transcript);

        setActualPhrase(normalizedTranscript);

        // Compare characters and create character-level feedback
        const comparison = normalizedTranscript.split('').map((char, index) => ({
          char,
          correct: char === normalizedPhrase[index]
        }));
        setCharacterComparison(comparison);

        if (normalizedTranscript === normalizedPhrase) {
          setJudgementMessage("PERFECT!");
        } else {
          setJudgementMessage("TRY AGAIN!");
        }
      } else {
        console.warn("No current phrase available for comparison.");
      }

      resetTranscript();
    }
  }, [listening, transcript, currentPhrase, resetTranscript]);

  if (!isClient) {
    // Prevent rendering on the server
    return null;
  }

  if (!browserSupportsSpeechRecognition) {
    return <div>Your browser does not support speech recognition.</div>;
  }

  if (!chapter || !chapter.topics || levelChapters.length === 0) {
    return <div>Loading...</div>;
  }

  if (!isMicrophoneAvailable) { return <div>Microphone is not available</div>; }


  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Left Section: Topics */}
          <section className="w-full md:w-1/3 bg-gray-200 p-4 overflow-auto max-h-[32rem]">
            <select
              className="flex-1 w-full bg-[#f0f0f0] mb-4"
              onChange={(e) => {
                setCurrentLevelPointer(
                  levelChapters.findIndex((level: { name: string }) => level.name === e.target.value)
                );
                setCurrentPhrasePointer(0);
                setCurrentTopicPointer(1);
                resetAttempt();
              }}
            >
              {levelChapters.length > 0 ? (
                levelChapters.map((level: { slug: React.Key | null | undefined; name: string }) => (
                  <option key={level.slug} value={String(level.name || '')}>
                    {level.name}
                  </option>
                ))
              ) : (
                <option disabled>No levels available</option>
              )}
            </select>
            <ul className="space-y-2">
              {chapter.topics.map((topic: any, i) => (
                topic.length === 0 ? <li key={topic.label} className='font-bold uppercase'>{topic.label}</li> :
                  <li
                    key={topic.label}
                    className={`p-2 rounded-md shadow-sm hover:bg-gray-100 cursor-pointer ${i === currentTopicPointer ? 'bg-gray-300' : 'bg-white'}`}
                    onClick={() => {
                      setCurrentTopicPointer(i);
                      setCurrentPhrasePointer(0);
                      resetAttempt();
                    }}
                  >
                    {topic.label}
                  </li>
              ))}
            </ul>
          </section>

          {/* Right Section: Current Phrases */}
          <section className="w-full md:w-2/3 p-4 bg-blue-100 min-h-[32rem] flex flex-col items-center relative">
            {/* Top Content */}
            <div className="space-y-4 text-center mt-8">
              <div className="text-lg font-medium text-gray-800">
                <RoundButton
                  onClick={() => playPhrase(currentPhrase[0])}
                  backgroundImage={Volume}
                  noShadow={false}
                />
                <h4>{currentPhrase[0]}</h4> {/* Chinese */}
              </div>
              <div className="text-sm text-gray-600">{currentPhrase[1]}</div> {/* English */}
              {characterComparison && (
                <div className="flex flex-wrap justify-center gap-1">
                  {characterComparison.map((char, index) => (
                    <span
                      key={index}
                      className={`text-lg ${char.correct ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                      {char.char}
                    </span>
                  ))}
                </div>
              )}
              {judgementMessage && (
                <div className={`text-lg font-bold ${judgementMessage === "PERFECT!" ? 'text-green-600' : 'text-red-600'
                  }`}>
                  {judgementMessage}
                </div>
              )}
            </div>

            {/* Lower Container: Microphone and Counters/Buttons */}
            <div className="mt-auto flex flex-col items-center w-full pb-4">
              {/* Microphone (centered above counters) */}
              <button
                onClick={() => {
                  if (listening) {
                    stopListening();
                  } else {
                    startListening();
                  }
                }}
                className="mb-2"
              >
                <div
                  className={`${listening ? 'bg-red-400 animate-pulse' : 'bg-[#fdd440]'
                    } w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ease-in-out shadow-md hover:scale-110 hover:opacity-80 hover:shadow-lg`}
                >
                  <Microphone isListening={listening} />
                </div>
              </button>

              {/* Left/Right Buttons */}
              <div className="flex space-x-4 mt-4 items-end">
                <RoundButton backgroundImage={prevImg} onClick={() => {
                  setCurrentPhrasePointer((prev) => currentPhrasePointer <= 0 ? (currentTopic?.phrases.length ?? 1) - 1 : prev - 1);
                  resetAttempt()
                }} />
                {/* X/Y Counters */}
                <div className="text-base font-medium mb-2">
                  {currentPhrasePointer + 1} / {currentTopic?.phrases.length}
                </div>

                <RoundButton backgroundImage={nextImg} onClick={() => {
                  setCurrentPhrasePointer((prev) => {
                    const maxLength = (currentTopic?.phrases?.length ?? 0) - 1;
                    return currentPhrasePointer >= maxLength ? 0 : prev + 1;
                  });
                  resetAttempt();
                }}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

function normalizePhrase(phrase: string) {
  return phrase.replace(/[。，？！.,\?\!/\(\)\"\'\s]/g, "").toLowerCase();
}

function playPhrase(phrase: string) {
  const utterThis = new SpeechSynthesisUtterance(phrase)
  const myLang = utterThis.lang
  utterThis.lang = preferredLanguage

  if (synth) {
    synth.speak(utterThis)
  }
}

const Microphone = ({ isListening }: { isListening: boolean }) => (
  <div className={`${isListening ? 'bg-red-400 animate-pulse' : 'bg-[#fdd440]'} w-24 h-16 rounded-full flex items-center justify-center transition-all duration-200 ease-in-out shadow-md hover:scale-110 hover:opacity-80 hover:shadow-lg`}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="#00f"
    >
      <path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Zm40-360q17 0 28.5-11.5T520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480Z" />
    </svg>
  </div>
);

interface RoundButtonProps {
  backgroundImage: string;
  onClick: () => void;
  noShadow?: boolean;
}
const RoundButton = ({ backgroundImage, onClick, noShadow }: RoundButtonProps) => {
  return (
    <button
      style={{ backgroundImage: backgroundImage }}
      className={`w-10 h-10 bg-no-repeat bg-center bg-contain rounded-full transition-transform duration-200 ease-in-out hover:scale-110 hover:opacity-80 ${noShadow ? '' : 'hover:shadow-lg'}`}
      onClick={onClick}
    />
  );
};
const nextImg =
  'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSI5Mi4xMzUiIGZpbGw9Im5vbmUiLz48L2NsaXBQYXRoPjxjbGlwUGF0aCBpZD0iYyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiLz48L2NsaXBQYXRoPjwvZGVmcz48ZyBpZD0iYiIgY2xpcC1wYXRoPSJ1cmwoI2MpIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwIDMuOTMyKSI+PGcgY2xpcC1wYXRoPSJ1cmwoI2EpIj48cGF0aCBkPSJNMTAwLDQ1LjUwNmMwLDM2LjgtMjIuMzg2LDQ2LjYyOS01MCw0Ni42MjlTMCw3OC4zNzEsMCw0NS41MDYsMjMuNTA5LDAsNTEuMTIzLDAsMTAwLDguNzA4LDEwMCw0NS41MDYiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAgMCkiIGZpbGw9IiNmZmYiLz48L2c+PC9nPjxwYXRoIGQ9Ik0yOS45MTcsNi4zNTEsNDMuMiwxOS41NDRhMy42MTYsMy42MTYsMCwwLDEsLjk3NiwyLjM0NiwzLjQ3NiwzLjQ3NiwwLDAsMS0uOTczLDIuMzQ5TDI5LjkyLDM3LjQzMWEzLjMyMSwzLjMyMSwwLDAsMS0zLjYyLjcyMSwzLjEwOSwzLjEwOSwwLDAsMS0yLjA0OS0yLjk3NlY4LjdhMy4zMTcsMy4zMTcsMCwwLDEsNS42NjctMi4zNDZaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxOS4xMDcgMjcuNzE4KSIgZmlsbD0iIzEwNzBiNiIvPjwvZz48L3N2Zz4=)';
const prevImg =
  'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSI5Mi4xMzUiIGZpbGw9Im5vbmUiLz48L2NsaXBQYXRoPjxjbGlwUGF0aCBpZD0iYyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiLz48L2NsaXBQYXRoPjwvZGVmcz48ZyBpZD0iYiIgY2xpcC1wYXRoPSJ1cmwoI2MpIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwIDMuOTMyKSI+PGcgY2xpcC1wYXRoPSJ1cmwoI2EpIj48cGF0aCBkPSJNMTAwLDQ1LjUwNmMwLDM2LjgtMjIuMzg2LDQ2LjYyOS01MCw0Ni42MjlTMCw3OC4zNzIsMCw0NS41MDYsMjMuNTEsMCw1MS4xMjQsMCwxMDAsOC43MDgsMTAwLDQ1LjUwNiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCAwKSIgZmlsbD0iI2ZmZiIvPjwvZz48L2c+PHBhdGggZD0iTTM0Ljc2MiwzNy42MTUsMjEuNDc2LDI0LjQyMkEzLjcyNiwzLjcyNiwwLDAsMSwyMC41LDIxLjg5YTMuMTU4LDMuMTU4LDAsMCwxLC45NzMtMi4zNDlMMzQuNzU5LDYuMzQ4QTMuMzIxLDMuMzIxLDAsMCwxLDQwLjQyOSw4LjdWMzUuMTc2YTMuMzIzLDMuMzIzLDAsMCwxLTIuMDUsMy4wN0EzLjI3OSwzLjI3OSwwLDAsMSwzNC43NjIsMzcuNjE1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTYuMjE0IDI3LjcxOCkiIGZpbGw9IiMxMDcwYjYiLz48L2c+PC9zdmc+)';

const Volume = 'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NzYgNTEyIj48cGF0aCBkPSJNNDQ0LjU2MiAxODEuOTQyQzQzNC4yODEgMTczLjU5OCA0MTkuMTU2IDE3NS4wNjcgNDEwLjgxMiAxODUuMzQ4QzQwMi40MDYgMTk1LjU5OCA0MDMuOTA2IDIxMC43MjMgNDE0LjE4OCAyMTkuMTI5QzQyNS41IDIyOC4zNzkgNDMyIDI0MS44MTYgNDMyIDI1Ni4wMDNDNDMyIDI3MC4xOSA0MjUuNSAyODMuNjI4IDQxNC4xODggMjkyLjg3OEM0MDMuOTA2IDMwMS4yODQgNDAyLjQwNiAzMTYuNDA5IDQxMC44MTIgMzI2LjY1OEM0MTUuNTMxIDMzMi40NzEgNDIyLjQzNyAzMzUuNDcxIDQyOS4zNzUgMzM1LjQ3MUM0MzQuNzE5IDMzNS40NzEgNDQwLjEyNSAzMzMuNjkgNDQ0LjU2MiAzMzAuMDY1QzQ2Ny4wOTQgMzExLjYyNyA0ODAgMjg0LjY1OSA0ODAgMjU2LjAwM1M0NjcuMDk0IDIwMC4zNzkgNDQ0LjU2MiAxODEuOTQyWk01MDUuMTI1IDEwOC4wMDVDNDk0LjkwNiA5OS42NjIgNDc5Ljc4MSAxMDEuMDk5IDQ3MS4zNDQgMTExLjM0OUM0NjIuOTM3IDEyMS41OTkgNDY0LjQzNyAxMzYuNzI0IDQ3NC42ODcgMTQ1LjEzQzUwOC41NjIgMTcyLjkxMSA1MjggMjEzLjMxNiA1MjggMjU2LjAwM1M1MDguNTYyIDMzOS4wOTYgNDc0LjY4OCAzNjYuODc3QzQ2NC40MzggMzc1LjI4MyA0NjIuOTM4IDM5MC40MDggNDcxLjM0NCA0MDAuNjU3QzQ3Ni4wOTQgNDA2LjQzOSA0ODIuOTY5IDQwOS40MzkgNDg5LjkwNiA0MDkuNDM5QzQ5NS4yODEgNDA5LjQzOSA1MDAuNjU2IDQwNy42NTcgNTA1LjEyNSA0MDQuMDAxQzU1MC4xNTYgMzY3LjA5NSA1NzYgMzEzLjEyNyA1NzYgMjU2LjAwM1M1NTAuMTU2IDE0NC45MTEgNTA1LjEyNSAxMDguMDA1Wk0zMzMuMTA5IDM0LjgxOUMzMjEuNjA5IDI5LjYzMSAzMDguMTU2IDMxLjcyNSAyOTguNzM0IDQwLjFMMTYzLjg0IDE2MC4wMDVIODBDNTMuNDkgMTYwLjAwNSAzMiAxODEuNDk2IDMyIDIwOC4wMDRWMzA0LjAwMkMzMiAzMzAuNTEgNTMuNDkgMzUyLjAwMiA4MCAzNTIuMDAySDE2My44NEwyOTguNzM0IDQ3MS45MDZDMzA0LjcxOSA0NzcuMjE5IDMxMi4zMTIgNDgwIDMyMCA0ODBDMzI0LjQzOCA0ODAgMzI4LjkwNiA0NzkuMDk0IDMzMy4xMDkgNDc3LjE4OEMzNDQuNjA5IDQ3Mi4wMzEgMzUyIDQ2MC41OTQgMzUyIDQ0OFY2NC4wMDZDMzUyIDUxLjQxMiAzNDQuNjA5IDM5Ljk3NSAzMzMuMTA5IDM0LjgxOVoiLz48L3N2Zz4=)'

export default Trainer;