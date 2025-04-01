'use client';

import React, { useEffect } from 'react';

import * as annyang from 'annyang';

const LANG_URL = 'https://ltl-school.info/wp-json/ltl/v1/pronun/lang/zh-CN';
const preferredLanguage = "zh-CN"
const synth = window.speechSynthesis

interface RoundButtonProps {
  backgroundImage: string;
  onClick: () => void;
}

interface Chapter {
  topics: {
    phrases: string[][];
    label: string;
  }[];
}


const RoundButton = ({ backgroundImage, onClick }: RoundButtonProps) => {
  return (
    <button
      style={{ backgroundImage: backgroundImage }}
      className="w-10 h-10 bg-no-repeat bg-center bg-contain rounded-full transition-transform duration-200 ease-in-out hover:scale-110 hover:opacity-80 hover:shadow-lg"
      onClick={onClick}
    />
  );
};


const Loading = () => <div>Loading...</div>;

const Trainer = () => {
  const [chapter, setChapter] = React.useState<Chapter | null>(null);
  const [levelJSON, setLevelJSON] = React.useState<any>(undefined);
  const [currentLevelPointer, setCurrentLevelPointer] = React.useState(0);
  const [currentPhrasePointer, setCurrentPhrasePointer] = React.useState(0);
  const [currentTopicPointer, setCurrentTopicPointer] = React.useState(1);
  const [actualPhrase, setActualPhrase] = React.useState<string | null>(null);
  const [judgementMessage, setJudgementMessage] = React.useState<string | null>(null);
  const [isListening, setIsListening] = React.useState(false);

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
        const aggregatedTopics = chapters.reduce((acc: any[], chapter: any) => {
          const heading = { phrases: [], label: chapter.title, length: 0 }
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
  const currentPhrase = currentTopic?.phrases?.[currentPhrasePointer] || [];

  // Remove HTML tags from the phrase
  for (let i = 0; i < currentPhrase.length; i++) {
    currentPhrase[i] = currentPhrase[i].replace(/<[^>]*>/g, '');
  }

  useEffect(() => {
    setCurrentPhrasePointer(0);
  }, [chapter]);

  useEffect(() => {
    const expectedPhrase = currentPhrase[0]
    refreshCallback(expectedPhrase)
  }, [currentPhrase]) // TODO

  if (!chapter || !chapter.topics || levelChapters.length === 0) {
    return <Loading />;
  }

  function startListening() {
    console.log('Starting listening')
    annyang.setLanguage(preferredLanguage)
    annyang.start({ autoRestart: true, continuous: false })
    setIsListening(true)
    setActualPhrase(null)
    setJudgementMessage(null)
  }
  
  function stopListening() {
    console.log("Stopping listening")
    annyang.abort()
    setIsListening(false)
  }
    

  function refreshCallback(expectedPhrase: string) {
    console.log("expecting ", expectedPhrase)
    annyang.addCallback("result", function (actualPhrases: string | any[]) {
      if (!expectedPhrase) {
        console.log("No expected phrase")
        return
      }
      const normalizedPhrase = normalizePhrase(expectedPhrase)
      console.log("actualPhrases", actualPhrases)
      console.log("normalizedPhrase", normalizedPhrase)
      console.log(judgePronunciation(expectedPhrase, actualPhrases[0]))
      setActualPhrase(normalizedPhrase)
      if (actualPhrases.includes(normalizedPhrase)) {
        setJudgementMessage('PERFECT!')
      } else {
        setJudgementMessage('TRY AGAIN!')
      }

      stopListening()
    })
    return () => {
      annyang.removeCallback("result");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full sm:w-[640px] md:w-[768px] lg:w-[1024px] xl:w-[1120px]">
      <div className="flex flex-col md:flex-row w-full max-w-4xl bg-white shadow-lg rounded-lg overflow-hidden">
        {/* Left Section: Topics */}
        <section className="w-full md:w-1/3 bg-gray-200 p-4 overflow-auto max-h-[32rem]">
          <select
            className="flex-1 w-full bg-[#f0f0f0] mb-4"
            onChange={(e) => {
              setCurrentLevelPointer(
                levelChapters.findIndex((level) => level.name === e.target.value)
              )
              setCurrentPhrasePointer(0)
              setCurrentTopicPointer(1)
              setActualPhrase(null)
              setJudgementMessage(null)
            }
            }
          >
            {levelChapters.length > 0 ? (
              levelChapters.map((level) => (
                <option key={level.slug} value={level.name}>
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
                    setCurrentTopicPointer(i)
                    setCurrentPhrasePointer(0)
                    setActualPhrase(null)
                    setJudgementMessage(null)
                  }}
                >
                  {topic.label}
                </li>
            ))}
          </ul>
        </section>

        {/* Right Section: Current Phrases */}
        <section className="w-full md:w-2/3 p-4 bg-blue-100 h-[32rem] flex flex-col items-center relative">
          {/* Top Content */}
          <div className="space-y-4 text-center mt-8">
            <div className="text-sm text-gray-600">{currentPhrase[2]}</div> {/* pinyin */}
            <div className="text-lg font-medium text-gray-800">
              <RoundButton
                onClick={() => playPhrase(currentPhrase[0])}
                backgroundImage={Volume}
              />
              <h4>{currentPhrase[0]}</h4> {/* Chinese */}
            </div>
            <div className="text-sm text-gray-600">{currentPhrase[1]}</div> {/* English */}
            {actualPhrase && <div>{actualPhrase}</div>}
            {judgementMessage && <div>{judgementMessage}</div>}
          </div>

          {/* Lower Container: Microphone and Counters/Buttons */}
          <div className="mt-auto flex flex-col items-center w-full pb-4">
            {/* Microphone (centered above counters) */}
            <button onClick={() => {
              if (isListening) {
                stopListening()
              } else {
                startListening()
              }
            }} className="mb-2">
              <Microphone isListening={isListening} />
            </button>
            {/* X/Y Counters */}
            <div className="text-base font-medium mb-2">
              {currentPhrasePointer + 1} / {currentTopic?.phrases.length}
            </div>
            {/* Navigation Buttons */}
            <div className="flex justify-between w-full px-4">
              <RoundButton
                backgroundImage={prevImg}
                onClick={() => {
                  setCurrentPhrasePointer((prev) =>
                    prev <= 0 ? currentTopic.phrases.length - 1 : prev - 1
                  )
                  setActualPhrase(null)
                  setJudgementMessage(null)
                }
                }
              />
              <RoundButton
                backgroundImage={nextImg}
                onClick={() => {
                  setCurrentPhrasePointer((prev) =>
                    prev >= currentTopic.phrases.length - 1 ? 0 : prev + 1
                  )
                  setActualPhrase(null)
                  setJudgementMessage(null)
                }
                }
              />
            </div>
          </div>
        </section>      
      </div>
    </div >
  );
};

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <Trainer />
      </main>
    </div>
  );
}

const nextImg =
  'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSI5Mi4xMzUiIGZpbGw9Im5vbmUiLz48L2NsaXBQYXRoPjxjbGlwUGF0aCBpZD0iYyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiLz48L2NsaXBQYXRoPjwvZGVmcz48ZyBpZD0iYiIgY2xpcC1wYXRoPSJ1cmwoI2MpIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwIDMuOTMyKSI+PGcgY2xpcC1wYXRoPSJ1cmwoI2EpIj48cGF0aCBkPSJNMTAwLDQ1LjUwNmMwLDM2LjgtMjIuMzg2LDQ2LjYyOS01MCw0Ni42MjlTMCw3OC4zNzEsMCw0NS41MDYsMjMuNTA5LDAsNTEuMTIzLDAsMTAwLDguNzA4LDEwMCw0NS41MDYiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAgMCkiIGZpbGw9IiNmZmYiLz48L2c+PC9nPjxwYXRoIGQ9Ik0yOS45MTcsNi4zNTEsNDMuMiwxOS41NDRhMy42MTYsMy42MTYsMCwwLDEsLjk3NiwyLjM0NiwzLjQ3NiwzLjQ3NiwwLDAsMS0uOTczLDIuMzQ5TDI5LjkyLDM3LjQzMWEzLjMyMSwzLjMyMSwwLDAsMS0zLjYyLjcyMSwzLjEwOSwzLjEwOSwwLDAsMS0yLjA0OS0yLjk3NlY4LjdhMy4zMTcsMy4zMTcsMCwwLDEsNS42NjctMi4zNDZaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxOS4xMDcgMjcuNzE4KSIgZmlsbD0iIzEwNzBiNiIvPjwvZz48L3N2Zz4=)';
const prevImg =
  'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSI5Mi4xMzUiIGZpbGw9Im5vbmUiLz48L2NsaXBQYXRoPjxjbGlwUGF0aCBpZD0iYyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiLz48L2NsaXBQYXRoPjwvZGVmcz48ZyBpZD0iYiIgY2xpcC1wYXRoPSJ1cmwoI2MpIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwIDMuOTMyKSI+PGcgY2xpcC1wYXRoPSJ1cmwoI2EpIj48cGF0aCBkPSJNMTAwLDQ1LjUwNmMwLDM2LjgtMjIuMzg2LDQ2LjYyOS01MCw0Ni42MjlTMCw3OC4zNzIsMCw0NS41MDYsMjMuNTEsMCw1MS4xMjQsMCwxMDAsOC43MDgsMTAwLDQ1LjUwNiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCAwKSIgZmlsbD0iI2ZmZiIvPjwvZz48L2c+PHBhdGggZD0iTTM0Ljc2MiwzNy42MTUsMjEuNDc2LDI0LjQyMkEzLjcyNiwzLjcyNiwwLDAsMSwyMC41LDIxLjg5YTMuMTU4LDMuMTU4LDAsMCwxLC45NzMtMi4zNDlMMzQuNzU5LDYuMzQ4QTMuMzIxLDMuMzIxLDAsMCwxLDQwLjQyOSw4LjdWMzUuMTc2YTMuMzIzLDMuMzIzLDAsMCwxLTIuMDUsMy4wN0EzLjI3OSwzLjI3OSwwLDAsMSwzNC43NjIsMzcuNjE1WiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTYuMjE0IDI3LjcxOCkiIGZpbGw9IiMxMDcwYjYiLz48L2c+PC9zdmc+)';

const Microphone = ({isListening}: {isListening: boolean}) => (
  <div className={`${isListening ? 'bg-red-400 animate-pulse' : 'bg-[#fdd440]'} w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ease-in-out shadow-md hover:scale-110 hover:opacity-80 hover:shadow-lg`}>
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

const Volume = 'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NzYgNTEyIj48cGF0aCBkPSJNNDQ0LjU2MiAxODEuOTQyQzQzNC4yODEgMTczLjU5OCA0MTkuMTU2IDE3NS4wNjcgNDEwLjgxMiAxODUuMzQ4QzQwMi40MDYgMTk1LjU5OCA0MDMuOTA2IDIxMC43MjMgNDE0LjE4OCAyMTkuMTI5QzQyNS41IDIyOC4zNzkgNDMyIDI0MS44MTYgNDMyIDI1Ni4wMDNDNDMyIDI3MC4xOSA0MjUuNSAyODMuNjI4IDQxNC4xODggMjkyLjg3OEM0MDMuOTA2IDMwMS4yODQgNDAyLjQwNiAzMTYuNDA5IDQxMC44MTIgMzI2LjY1OEM0MTUuNTMxIDMzMi40NzEgNDIyLjQzNyAzMzUuNDcxIDQyOS4zNzUgMzM1LjQ3MUM0MzQuNzE5IDMzNS40NzEgNDQwLjEyNSAzMzMuNjkgNDQ0LjU2MiAzMzAuMDY1QzQ2Ny4wOTQgMzExLjYyNyA0ODAgMjg0LjY1OSA0ODAgMjU2LjAwM1M0NjcuMDk0IDIwMC4zNzkgNDQ0LjU2MiAxODEuOTQyWk01MDUuMTI1IDEwOC4wMDVDNDk0LjkwNiA5OS42NjIgNDc5Ljc4MSAxMDEuMDk5IDQ3MS4zNDQgMTExLjM0OUM0NjIuOTM3IDEyMS41OTkgNDY0LjQzNyAxMzYuNzI0IDQ3NC42ODcgMTQ1LjEzQzUwOC41NjIgMTcyLjkxMSA1MjggMjEzLjMxNiA1MjggMjU2LjAwM1M1MDguNTYyIDMzOS4wOTYgNDc0LjY4OCAzNjYuODc3QzQ2NC40MzggMzc1LjI4MyA0NjIuOTM4IDM5MC40MDggNDcxLjM0NCA0MDAuNjU3QzQ3Ni4wOTQgNDA2LjQzOSA0ODIuOTY5IDQwOS40MzkgNDg5LjkwNiA0MDkuNDM5QzQ5NS4yODEgNDA5LjQzOSA1MDAuNjU2IDQwNy42NTcgNTA1LjEyNSA0MDQuMDAxQzU1MC4xNTYgMzY3LjA5NSA1NzYgMzEzLjEyNyA1NzYgMjU2LjAwM1M1NTAuMTU2IDE0NC45MTEgNTA1LjEyNSAxMDguMDA1Wk0zMzMuMTA5IDM0LjgxOUMzMjEuNjA5IDI5LjYzMSAzMDguMTU2IDMxLjcyNSAyOTguNzM0IDQwLjFMMTYzLjg0IDE2MC4wMDVIODBDNTMuNDkgMTYwLjAwNSAzMiAxODEuNDk2IDMyIDIwOC4wMDRWMzA0LjAwMkMzMiAzMzAuNTEgNTMuNDkgMzUyLjAwMiA4MCAzNTIuMDAySDE2My44NEwyOTguNzM0IDQ3MS45MDZDMzA0LjcxOSA0NzcuMjE5IDMxMi4zMTIgNDgwIDMyMCA0ODBDMzI0LjQzOCA0ODAgMzI4LjkwNiA0NzkuMDk0IDMzMy4xMDkgNDc3LjE4OEMzNDQuNjA5IDQ3Mi4wMzEgMzUyIDQ2MC41OTQgMzUyIDQ0OFY2NC4wMDZDMzUyIDUxLjQxMiAzNDQuNjA5IDM5Ljk3NSAzMzMuMTA5IDM0LjgxOVoiLz48L3N2Zz4=)'

function playPhrase(phrase: string) {
  const utterThis = new SpeechSynthesisUtterance(phrase)
  const myLang = utterThis.lang
  utterThis.lang = preferredLanguage


  synth.speak(utterThis)
}

function getDifference(s, t) {
  s = [...s].sort()
  t = [...t].sort()
  return t.filter((char, i) => char !== s[i])
}


function judgePronunciation(
  actualPronunciation: string,
  expectedPronunciation: string
) {
  if (actualPronunciation === expectedPronunciation) {
    return ""
  }
  const diffs = getDifference(
    actualPronunciation,
    normalizePhrase(expectedPronunciation)
  )
  if (!diffs) {
    return expectedPronunciation
  }
  console.log({ diffs })
  return ""
}

function normalizePhrase(phrase: string) {
  let normalizedPhrase = phrase.replace(
    /[。，？！.,\?\!/\(\)\"\'\s]/g,
    ""
  )
  return normalizedPhrase
}

