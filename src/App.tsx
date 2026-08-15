import { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import briefsData from './briefs.json';

interface Card {
  id: string;
  title: string;
  effects: {
    stability: number;
    solvency: number;
    morality: number;
  };
  realWorldContext?: string;
}

interface Brief {
  date: string;
  id: number;
  title: string;
  scenario: string;
  targets: {
    stability: number;
    solvency: number;
    morality: number;
  };
  cards: Card[];
  debrief: string;
}

const INITIAL_METERS = { stability: 30, solvency: 30, morality: 30 };

type MeterKey = 'stability' | 'solvency' | 'morality';

const METER_META: Record<MeterKey, {
  label: string;
  short: string;
  barColor: string;
  textColor: string;
  badgeBg: string;
  badgeText: string;
}> = {
  stability: {
    label: 'Stability (Political)',
    short: 'S',
    barColor: '#4a90d9',
    textColor: '#7fb3e8',
    badgeBg: '#132538',
    badgeText: '#7fb3e8',
  },
  solvency: {
    label: 'Solvency (Economic)',
    short: '$',
    barColor: '#3fb673',
    textColor: '#7fcf9a',
    badgeBg: '#0f2a1c',
    badgeText: '#7fcf9a',
  },
  morality: {
    label: 'Morality (Ethical)',
    short: 'M',
    barColor: '#d9578f',
    textColor: '#e08bb0',
    badgeBg: '#2e1521',
    badgeText: '#e08bb0',
  },
};

const METER_ORDER: MeterKey[] = ['stability', 'solvency', 'morality'];

function EffectBadge({ meterKey, value }: { meterKey: MeterKey; value: number }) {
  const meta = METER_META[meterKey];
  const sign = value > 0 ? '+' : '';
  const isZero = value === 0;
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: '4px',
        backgroundColor: isZero ? '#232326' : meta.badgeBg,
        color: isZero ? '#666' : meta.badgeText,
        fontFamily: 'monospace',
        letterSpacing: '0.2px',
      }}
    >
      {meta.short} {sign}{value}
    </span>
  );
}

export default function App() {
  const [currentBrief, setCurrentBrief] = useState<Brief | null>(null);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [attemptsLeft, setAttemptsLeft] = useState<number>(3);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost' | 'played'>('playing');
  const [meters, setMeters] = useState(INITIAL_METERS);
  const [streak, setStreak] = useState<number>(0);
  const [history, setHistory] = useState<string[]>([]);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);

 useEffect(() => {
    // Uses local timezone date (YYYY-MM-DD)
    const today = new Date().toLocaleDateString('en-CA');
    const briefs = briefsData as Brief[];
    const foundBrief = briefs.find(b => b.date === today);

    let selectedBrief: Brief;
    if (foundBrief) {
      selectedBrief = foundBrief;
    } else {
      // No scenario scheduled for today — cycle through existing briefs based on
      // days elapsed since the first one, instead of silently repeating brief #1.
      const firstDate = new Date(briefs[0].date + 'T00:00:00');
      const todayDate = new Date(today + 'T00:00:00');
      const daysSinceStart = Math.floor((todayDate.getTime() - firstDate.getTime()) / 86400000);
      const index = ((daysSinceStart % briefs.length) + briefs.length) % briefs.length;
      selectedBrief = briefs[index];
      console.warn(
        `[The Brief] No scenario scheduled for ${today} — falling back to brief #${selectedBrief.id} ("${selectedBrief.title}"). Add more entries to briefs.json.`
      );
    }
    setCurrentBrief(selectedBrief);

    const savedStreak = parseInt(localStorage.getItem('tb_streak') || '0', 10);
    const savedHistory: string[] = JSON.parse(localStorage.getItem('tb_history') || '[]');
    setStreak(savedStreak);
    setHistory(savedHistory);

    // Check if directly refreshing on a completed URL or if already played today
    const path = window.location.pathname;
    if (path.includes('/completed/won')) {
      setGameState('won');
    } else if (path.includes('/completed/lost')) {
      setGameState('lost');
    } else if (savedHistory.includes(selectedBrief.date)) {
      setGameState('played');
      if (window.location.pathname !== '/completed/played') {
        window.history.pushState({}, '', '/completed/played');
      }
    }
  }, []);
  if (!currentBrief) return <div className="bg-[#121212] min-h-screen text-white p-8">Loading Brief...</div>;

  const toggleCard = (card: Card) => {
    if (gameState !== 'playing') return;
    if (selectedCards.some(c => c.id === card.id)) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else if (selectedCards.length < 2) {
      setSelectedCards([...selectedCards, card]);
    }
  };

  const executePolicies = () => {
    if (selectedCards.length !== 2 || attemptsLeft <= 0) return;

    let newStability = INITIAL_METERS.stability;
    let newSolvency = INITIAL_METERS.solvency;
    let newMorality = INITIAL_METERS.morality;

    selectedCards.forEach(card => {
      newStability += card.effects.stability;
      newSolvency += card.effects.solvency;
      newMorality += card.effects.morality;
    });

    newStability = Math.max(0, Math.min(100, newStability));
    newSolvency = Math.max(0, Math.min(100, newSolvency));
    newMorality = Math.max(0, Math.min(100, newMorality));

    setMeters({ stability: newStability, solvency: newSolvency, morality: newMorality });

    const winCondition = 
      newStability >= currentBrief.targets.stability &&
      newSolvency >= currentBrief.targets.solvency &&
      newMorality >= currentBrief.targets.morality;

    const nextAttempts = attemptsLeft - 1;
    setAttemptsLeft(nextAttempts);

  if (winCondition) {
      setGameState('won');
      updateStreak(true);
      saveResult('won', 3 - nextAttempts);

      // Instantly push completion path for Vercel Analytics pageview logging
      window.history.pushState({}, '', '/completed/won');
      window.dispatchEvent(new Event('popstate'));
    } else if (nextAttempts === 0) {
      setGameState('lost');
      updateStreak(false);
      saveResult('lost', 3 - nextAttempts);

      window.history.pushState({}, '', '/completed/lost');
      window.dispatchEvent(new Event('popstate'));
    }
  };

  // Persists the real outcome + attempts used for a given date, so the share
  // button stays accurate even after a page reload, revisit, or when someone
  // returns after already completing today's brief (gameState === 'played').
  const saveResult = (outcome: 'won' | 'lost', attemptsUsed: number) => {
    try {
      const results = JSON.parse(localStorage.getItem('tb_results') || '{}');
      results[currentBrief.date] = { outcome, attemptsUsed };
      localStorage.setItem('tb_results', JSON.stringify(results));
    } catch {
      // Non-critical: sharing will fall back to live state if this fails.
    }
  };

  const getSavedResult = (): { outcome: 'won' | 'lost'; attemptsUsed: number } | null => {
    try {
      const results = JSON.parse(localStorage.getItem('tb_results') || '{}');
      return results[currentBrief.date] ?? null;
    } catch {
      return null;
    }
  };

  const updateStreak = (won: boolean) => {
    const newStreak = won ? streak + 1 : 0;
    const newHistory = [...history, currentBrief.date];
    setStreak(newStreak);
    setHistory(newHistory);
    localStorage.setItem('tb_streak', newStreak.toString());
    localStorage.setItem('tb_history', JSON.stringify(newHistory));
  };
const copyResults = async () => {
    // Prefer the saved record for today's date — it's accurate even if the
    // page was reloaded or the player is revisiting after already finishing.
    // Live gameState/attemptsLeft are only trustworthy in the same session
    // the round was actually completed in.
    const saved = getSavedResult();
    const outcome: 'won' | 'lost' = saved?.outcome ?? (gameState === 'won' ? 'won' : 'lost');
    const attemptsUsed = saved?.attemptsUsed ?? (3 - attemptsLeft);

    // Visible in browser dev tools (F12 -> Console) for easy debugging if the
    // shared result ever looks wrong again.
    console.log('[The Brief] Sharing result:', { saved, gameState, outcome, attemptsUsed });

    const shareText = `The Brief #${currentBrief.id} 🏛️\nStatus: ${outcome === 'won' ? 'PASSED 🟩' : 'FAILED 🟥'}\nAttempts: ${attemptsUsed}/3\n🔥 Streak: ${streak} Days\n\nCan you handle today's crisis?\nhttps://${window.location.host}`;

    try {
      await navigator.clipboard.writeText(shareText);
      alert('Results copied to clipboard!');
    } catch (err) {
      console.error('[The Brief] Clipboard write failed:', err);
      alert('Could not copy automatically — here is your result:\n\n' + shareText);
    }
  };
  return (
    <>
      <Analytics />
      <div className="bg-[#121212] min-h-screen text-gray-100 font-sans flex flex-col items-center p-4">
        <div className="w-full max-w-md border-b border-gray-800 pb-3 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-medium tracking-wide text-white" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>The Brief</h1>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Daily Policy Challenge #{currentBrief.id}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-amber-400">🔥 {streak} Day Streak</span>
          </div>
        </div>

        <div
          className="w-full max-w-md bg-[#1a1a1c] rounded-r-lg p-4 mb-6"
          style={{ borderLeft: '3px solid #4a4a4a', borderRadius: '0 8px 8px 0' }}
        >
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Morning Intelligence</h2>
          <p className="text-sm text-gray-200 leading-relaxed">{currentBrief.scenario}</p>
        </div>

        <div className="w-full max-w-md space-y-2 mb-6">
          {METER_ORDER.map((key) => {
            const meta = METER_META[key];
            const val = meters[key];
            const target = currentBrief.targets[key];
            const met = val >= target;
            return (
              <div key={key} className="bg-[#1a1a1c] p-2.5 rounded-lg">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium" style={{ color: meta.textColor }}>{meta.label}</span>
                  <span className="font-mono" style={{ color: met ? meta.textColor : '#777' }}>
                    {val}% <span className="text-gray-600">/ {target}%</span>
                  </span>
                </div>
                <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: `${val}%`, backgroundColor: meta.barColor, opacity: met ? 1 : 0.6 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="w-full max-w-md grid grid-cols-1 gap-2 mb-6">
          <p className="text-xs text-gray-400 mb-1">Select 2 Levers ({selectedCards.length}/2):</p>
          {currentBrief.cards.map((card) => {
            const isSelected = selectedCards.some(c => c.id === card.id);
            const isExpanded = expandedInfo === card.id;
            return (
              <div key={card.id}>
                <button
                  onClick={() => toggleCard(card)}
                  disabled={gameState !== 'playing'}
                  className={`w-full p-3 rounded-lg border transition-all text-sm font-medium flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-white text-black border-white'
                      : 'bg-[#1c1c1e] text-gray-300 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <span className="text-left">{card.title}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {METER_ORDER.map((key) => (
                      <EffectBadge key={key} meterKey={key} value={card.effects[key]} />
                    ))}
                    {card.realWorldContext && (
                      <span
                        role="button"
                        aria-label={`Real-world context for ${card.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedInfo(isExpanded ? null : card.id);
                        }}
                        className="ml-1 flex items-center justify-center rounded-full"
                        style={{
                          width: '18px',
                          height: '18px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isSelected ? '#555' : '#999',
                          backgroundColor: isSelected ? '#eee' : '#2a2a2a',
                          cursor: 'pointer',
                        }}
                      >
                        i
                      </span>
                    )}
                  </span>
                </button>
                {isExpanded && card.realWorldContext && (
                  <div
                    className="text-xs text-gray-400 leading-relaxed px-3 py-2 mt-1 rounded-lg"
                    style={{ backgroundColor: '#161618', border: '1px solid #2a2a2a' }}
                  >
                    <span className="text-gray-500 font-semibold uppercase tracking-wide" style={{ fontSize: '9px' }}>
                      In the real world
                    </span>
                    <p className="mt-1">{card.realWorldContext}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {gameState === 'playing' ? (
          <button
            onClick={executePolicies}
            disabled={selectedCards.length !== 2}
            className="w-full max-w-md py-3 bg-white text-black font-bold uppercase tracking-wider rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 transition"
          >
            Execute Policies ({attemptsLeft} Left)
          </button>
        ) : (
          <div
            className="w-full max-w-md p-5 rounded-lg text-center space-y-3"
            style={{
              backgroundColor: gameState === 'won' ? '#0f2a1c' : gameState === 'lost' ? '#2e1521' : '#1c1c1e',
              border: `1px solid ${gameState === 'won' ? '#1f5c3c' : gameState === 'lost' ? '#5c2b40' : '#2a2a2a'}`,
            }}
          >
            <h3 className="text-lg font-bold text-white">
              {gameState === 'won' && '🎉 Crisis Averted'}
              {gameState === 'lost' && '⚠️ Mission Failed'}
              {gameState === 'played' && '🏛️ Already Played Today'}
            </h3>

            {gameState === 'played' && (
              <p className="text-xs text-amber-400 font-semibold tracking-wide">
                Come back tomorrow for a new puzzle!
              </p>
            )}

            <p className="text-xs text-gray-300 leading-relaxed">{currentBrief.debrief}</p>
            
            <button
              onClick={copyResults}
              className="w-full py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500 transition text-sm"
            >
              Share Results 📋
            </button>
          </div>
        )}
      </div>
    </>
  );
}
