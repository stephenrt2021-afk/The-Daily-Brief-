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

export default function App() {
  const [currentBrief, setCurrentBrief] = useState<Brief | null>(null);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [attemptsLeft, setAttemptsLeft] = useState<number>(3);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost' | 'played'>('playing');
  const [meters, setMeters] = useState({ stability: 30, solvency: 30, morality: 30 });
  const [streak, setStreak] = useState<number>(0);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const foundBrief = (briefsData as Brief[]).find(b => b.date === today) || (briefsData as Brief[])[0];
    setCurrentBrief(foundBrief);

    const savedStreak = parseInt(localStorage.getItem('tb_streak') || '0', 10);
    const savedHistory: string[] = JSON.parse(localStorage.getItem('tb_history') || '[]');
    setStreak(savedStreak);
    setHistory(savedHistory);

    if (savedHistory.includes(foundBrief.date)) {
      setGameState('played');
    }
  }, []);

  // Free Virtual Page View tracking: Updates the path when brief ends
  useEffect(() => {
    if (gameState !== 'playing') {
      window.history.pushState({}, '', `/completed/${gameState}`);
    }
  }, [gameState]);

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

    let newStability = meters.stability;
    let newSolvency = meters.solvency;
    let newMorality = meters.morality;

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
    } else if (nextAttempts === 0) {
      setGameState('lost');
      updateStreak(false);
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

  const copyResults = () => {
    const shareText = `The Brief #${currentBrief.id} 🏛️\nStatus: ${gameState === 'won' ? 'PASSED 🟩' : 'FAILED 🟥'}\nAttempts: ${3 - attemptsLeft}/3\n🔥 Streak: ${streak} Days\nplaythebrief.com`;
    navigator.clipboard.writeText(shareText);
    alert('Results copied to clipboard!');
  };

  return (
    <>
      <Analytics />
      <div className="bg-[#121212] min-h-screen text-gray-100 font-sans flex flex-col items-center p-4">
        <div className="w-full max-w-md border-b border-gray-800 pb-3 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black tracking-widest text-white uppercase">The Brief</h1>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Daily Policy Challenge #{currentBrief.id}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-400">🔥 {streak} Day Streak</span>
          </div>
        </div>

        <div className="w-full max-w-md bg-[#1c1c1e] border border-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Morning Intelligence</h2>
          <p className="text-sm text-gray-200 leading-relaxed">{currentBrief.scenario}</p>
        </div>

        <div className="w-full max-w-md space-y-4 mb-6">
          {[
            { label: 'Stability (Political)', val: meters.stability, target: currentBrief.targets.stability },
            { label: 'Solvency (Economic)', val: meters.solvency, target: currentBrief.targets.solvency },
            { label: 'Morality (Ethical)', val: meters.morality, target: currentBrief.targets.morality }
          ].map((m, idx) => (
            <div key={idx} className="bg-[#1c1c1e] p-3 rounded-lg border border-gray-800">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-gray-300">{m.label}</span>
                <span className={m.val >= m.target ? "text-green-400 font-mono" : "text-gray-400 font-mono"}>
                  {m.val}% (Target: &gt;{m.target}%)
                </span>
              </div>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${m.val >= m.target ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${m.val}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="w-full max-w-md grid grid-cols-1 gap-2 mb-6">
          <p className="text-xs text-gray-400 mb-1">Select 2 Levers ({selectedCards.length}/2):</p>
          {currentBrief.cards.map((card) => {
            const isSelected = selectedCards.some(c => c.id === card.id);
            return (
              <button
                key={card.id}
                onClick={() => toggleCard(card)}
                disabled={gameState !== 'playing'}
                className={`p-3 text-left rounded-lg border transition-all text-sm font-medium ${
                  isSelected 
                    ? 'bg-white text-black border-white' 
                    : 'bg-[#1c1c1e] text-gray-300 border-gray-800 hover:border-gray-700'
                }`}
              >
                {card.title}
              </button>
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
          <div className="w-full max-w-md bg-[#1c1c1e] border border-gray-800 p-5 rounded-lg text-center space-y-3">
            <h3 className="text-lg font-bold text-white">
              {gameState === 'won' ? '🎉 Crisis Averted' : '⚠️ Mission Failed'}
            </h3>
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
