import { useEffect, useMemo, useState } from 'react';
import {
  weekdays,
  timeSlots,
  scenarios,
  characterRoster,
  itemCatalog,
  createInitialGameState,
  getScenarioById,
} from './data/gameData';

const STORAGE_KEY = 'classroom-rp-save-v1';
const SAVE_SLOTS = [1, 2, 3];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const readLocalStorage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op for restricted environments
  }
};

const formatSigned = (value) => `${value > 0 ? '+' : ''}${value}`;

const safeClone = (value) => JSON.parse(JSON.stringify(value));

function App() {
  const [game, setGame] = useState(() => {
    const stored = readLocalStorage(STORAGE_KEY);
    return stored || createInitialGameState();
  });
  const [activeScreen, setActiveScreen] = useState('game');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    writeLocalStorage(STORAGE_KEY, game);
  }, [game]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const currentScenario = useMemo(
    () => getScenarioById(game.currentScenarioId) || scenarios['intro-arrival'],
    [game.currentScenarioId]
  );

  const dayLabel = weekdays[game.dayIndex];
  const timeLabel = timeSlots[game.timeIndex];

  const applyChoiceEffect = (choice, currentState) => {
    const nextState = safeClone(currentState);
    const player = nextState.player;
    const characters = nextState.characters;
    const hiddenFlags = nextState.hiddenFlags;
    const inventory = nextState.inventory;
    const log = nextState.journal;

    if (choice.consequences?.privatePoints) {
      player.privatePoints = clamp(player.privatePoints + choice.consequences.privatePoints, 0, 9999);
    }
    if (choice.consequences?.money) {
      player.money = clamp(player.money + choice.consequences.money, 0, 99999);
    }
    if (choice.consequences?.reputation) {
      player.reputation = clamp(player.reputation + choice.consequences.reputation, 0, 100);
    }
    if (choice.consequences?.influence) {
      player.influence = clamp(player.influence + choice.consequences.influence, 0, 100);
    }
    if (choice.consequences?.intelligence) {
      player.intelligence = clamp(player.intelligence + choice.consequences.intelligence, 0, 100);
    }
    if (choice.consequences?.strategy) {
      player.strategy = clamp(player.strategy + choice.consequences.strategy, 0, 100);
    }
    if (choice.consequences?.popularity) {
      player.popularity = clamp(player.popularity + choice.consequences.popularity, 0, 100);
    }
    if (choice.consequences?.experience) {
      player.experience += choice.consequences.experience;
    }

    if (choice.consequences?.relationship) {
      Object.entries(choice.consequences.relationship).forEach(([characterId, delta]) => {
        const target = characters[characterId];
        if (!target) return;
        target.relation = clamp(target.relation + delta, -100, 100);
        target.trust = clamp(target.trust + Math.max(0, delta), 0, 100);
        target.suspicion = clamp(target.suspicion + Math.min(0, delta), 0, 100);
      });
    }

    if (choice.consequences?.hidden) {
      Object.entries(choice.consequences.hidden).forEach(([key, value]) => {
        hiddenFlags[key] = value;
      });
    }

    if (choice.consequences?.inventoryAdd) {
      choice.consequences.inventoryAdd.forEach((itemId) => {
        const entry = inventory.find((item) => item.id === itemId);
        if (entry) {
          entry.quantity += 1;
        }
      });
    }

    if (choice.consequences?.inventoryRemove) {
      choice.consequences.inventoryRemove.forEach((itemId) => {
        const entry = inventory.find((item) => item.id === itemId);
        if (entry && entry.quantity > 0) {
          entry.quantity -= 1;
        }
      });
    }

    if (choice.decisionTag) {
      nextState.decisionHistory.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tag: choice.decisionTag,
        day: dayLabel,
        time: timeLabel,
        summary: choice.text,
      });
    }

    if (choice.journalEntry) {
      log.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        date: `${dayLabel} • ${timeLabel}`,
        title: choice.journalEntry.title,
        text: choice.journalEntry.text,
      });
    }

    if (choice.consequences?.notes) {
      nextState.eventNotes.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: choice.text,
        detail: choice.consequences.notes,
      });
    }

    nextState.lastAction = choice.text;
    nextState.turnCount += 1;

    let nextDay = nextState.dayIndex;
    let nextTime = nextState.timeIndex + 1;
    if (nextTime >= timeSlots.length) {
      nextDay = (nextDay + 1) % weekdays.length;
      nextTime = 0;
    }
    nextState.dayIndex = nextDay;
    nextState.timeIndex = nextTime;

    const nextScenarioId = choice.nextScenario || nextState.currentScenarioId;
    nextState.currentScenarioId = nextScenarioId;

    if (Math.random() < 0.28) {
      const randomEvent = [
        'Un étudiant te demande un conseil pendant le couloir.',
        'Un professeur note discrètement ta réaction en classe.',
        'Une discussion dans la cour éclate entre deux groupes.',
        'Tu repères une opportunité de faiblesse dans une alliance.',
      ][Math.floor(Math.random() * 4)];

      nextState.randomEvent = randomEvent;
      log.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        date: `${weekdays[nextDay]} • ${timeSlots[nextTime]}`,
        title: 'Événement aléatoire',
        text: randomEvent,
      });
    }

    return nextState;
  };

  const handleChoice = (choice) => {
    setGame((previous) => applyChoiceEffect(choice, previous));
    setNotice('Conséquence enregistrée.');
  };

  const saveCurrentGame = (slotNumber) => {
    const snapshot = safeClone(game);
    writeLocalStorage(`classroom-rp-slot-${slotNumber}`, snapshot);
    setNotice(`Sauvegarde ${slotNumber} enregistrée.`);
  };

  const loadSaveSlot = (slotNumber) => {
    const snapshot = readLocalStorage(`classroom-rp-slot-${slotNumber}`);
    if (!snapshot) {
      setNotice('Aucune sauvegarde dans cette case.');
      return;
    }
    setGame(snapshot);
    setActiveScreen('game');
    setNotice(`Sauvegarde ${slotNumber} chargée.`);
  };

  const resetGame = () => {
    const fresh = createInitialGameState();
    setGame(fresh);
    setActiveScreen('game');
    setNotice('Nouvelle partie lancée.');
  };

  const statCards = [
    { label: 'Points privés', value: game.player.privatePoints, tone: 'red' },
    { label: 'Argent', value: `${game.player.money}¥`, tone: 'gold' },
    { label: 'Réputation', value: game.player.reputation, tone: 'blue' },
    { label: 'Influence', value: game.player.influence, tone: 'violet' },
  ];

  const renderGameScreen = () => (
    <div className="screen-grid">
      <section className="scenario-panel panel">
        <div className="panel-header compact">
          <div>
            <p className="eyebrow">Scène active</p>
            <h2>{currentScenario.title}</h2>
          </div>
          <div className="time-badge">
            {dayLabel} • {timeLabel}
          </div>
        </div>

        <div className="scenario-visual">
          <img
            src={currentScenario.imageUrl || 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80'}
            alt={currentScenario.title}
          />
          <div className="visual-overlay" />
        </div>

        <div className="scenario-content">
          <div className="meta row">
            <span>Lieu : {currentScenario.location}</span>
            <span>Heure : {currentScenario.time}</span>
          </div>
          <p className="scenario-description">{currentScenario.description}</p>

          <div className="dialogue-box">
            {currentScenario.dialogues.map((line, idx) => (
              <p key={`${line}-${idx}`}>{line}</p>
            ))}
          </div>

          <div className="chars-line">
            {currentScenario.characters.map((id) => {
              const character = game.characters[id];
              if (!character) return null;
              return (
                <div key={id} className="char-pill">
                  <span className="avatar tiny">{character.avatar}</span>
                  <span>{character.name}</span>
                </div>
              );
            })}
          </div>

          <div className="choice-list">
            {currentScenario.choices.map((choice) => (
              <button
                key={choice.id}
                className="choice-button"
                onClick={() => handleChoice(choice)}
              >
                <span>{choice.text}</span>
                <small>
                  {choice.consequences?.money ? `${formatSigned(choice.consequences.money)}¥ ` : ''}
                  {choice.consequences?.privatePoints ? `${formatSigned(choice.consequences.privatePoints)} PP ` : ''}
                  {choice.consequences?.reputation ? `${formatSigned(choice.consequences.reputation)} réputation` : ''}
                </small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="info-panel panel">
        <div className="panel-header compact">
          <div>
            <p className="eyebrow">Ayanokoji</p>
            <h3>Profil du joueur</h3>
          </div>
        </div>

        <div className="mini-profile">
          <div className="avatar large">K</div>
          <div>
            <h4>{game.player.name}</h4>
            <p>{game.player.className}</p>
          </div>
        </div>

        <div className="small-stats">
          <div><span>Niveau</span><strong>{game.player.level}</strong></div>
          <div><span>EXP</span><strong>{game.player.experience}</strong></div>
          <div><span>Argent</span><strong>{game.player.money}¥</strong></div>
          <div><span>PP</span><strong>{game.player.privatePoints}</strong></div>
        </div>

        <div className="status-block">
          <h4>État du monde</h4>
          <p>{game.randomEvent || 'Aucune interruption apparente pour le moment.'}</p>
        </div>

        <div className="status-block">
          <h4>Dernière action</h4>
          <p>{game.lastAction || 'Le silence prend déjà le contrôle du lycée.'}</p>
        </div>
      </aside>
    </div>
  );

  const renderProfile = () => (
    <div className="panel content-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Profil</p>
          <h2>Fiche d'identité</h2>
        </div>
      </div>

      <div className="profile-layout">
        <div className="profile-summary">
          <div className="avatar huge">K</div>
          <div>
            <h3>{game.player.name}</h3>
            <p>{game.player.className}</p>
            <span>Année {game.player.year}</span>
          </div>
        </div>

        <div className="stat-grid four-columns">
          {statCards.map((item) => (
            <div key={item.label} className="metric-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="stats-panel">
          {[
            ['Intelligence', game.player.intelligence],
            ['Stratégie', game.player.strategy],
            ['Influence', game.player.influence],
            ['Popularité', game.player.popularity],
          ].map(([label, value]) => (
            <div key={label} className="bar-row">
              <label>{label}</label>
              <div className="bar-track">
                <span style={{ width: `${value}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="history-box">
          <h4>Historique des décisions</h4>
          {game.decisionHistory.length === 0 ? (
            <p>Aucune décision marquante pour le moment.</p>
          ) : (
            <ul>
              {game.decisionHistory.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.day}</strong> • {entry.time} • {entry.summary}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const renderInventory = () => (
    <div className="panel content-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Inventaire</p>
          <h2>Objets et ressources</h2>
        </div>
      </div>

      <div className="inventory-grid">
        {game.inventory.map((item) => (
          <div key={item.id} className="inventory-card">
            <div className="card-icon">{item.icon}</div>
            <div>
              <h4>{item.name}</h4>
              <p>{item.description}</p>
            </div>
            <div className="inventory-meta">
              <span>Qté : {item.quantity}</span>
              <span>Valeur : {item.value}¥</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCharacters = () => (
    <div className="panel content-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Personnages</p>
          <h2>Relations et confiance</h2>
        </div>
      </div>

      <div className="character-grid">
        {characterRoster.map((character) => {
          const state = game.characters[character.id];
          return (
            <div key={character.id} className="character-card">
              <div className="character-top">
                <div className="avatar medium">{character.avatar}</div>
                <div>
                  <h4>{character.name}</h4>
                  <p>{character.className}</p>
                </div>
              </div>

              <div className="trait-list">
                <span>Personnalité : {character.personality}</span>
                <span>Relation : {state.relation}</span>
                <span>Confiance : {state.trust}</span>
                <span>Méfiance : {state.suspicion}</span>
              </div>

              <div className="notes-box">
                {state.history.length ? (
                  state.history.map((entry, index) => (
                    <small key={`${entry}-${index}`}>{entry}</small>
                  ))
                ) : (
                  <small>Aucune interaction notable pour le moment.</small>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderJournal = () => (
    <div className="panel content-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Journal</p>
          <h2>Notes et événements</h2>
        </div>
      </div>

      <div className="journal-list">
        {game.journal.map((entry) => (
          <article key={entry.id} className="journal-entry">
            <div className="journal-head">
              <strong>{entry.title}</strong>
              <span>{entry.date}</span>
            </div>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>
    </div>
  );

  const renderSaves = () => (
    <div className="panel content-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Sauvegardes</p>
          <h2>Slots rapides</h2>
        </div>
      </div>

      <div className="save-grid">
        {SAVE_SLOTS.map((slot) => {
          const saved = readLocalStorage(`classroom-rp-slot-${slot}`);

          return (
            <div key={slot} className="save-card">
              <h4>Slot {slot}</h4>
              <p>
                {saved
                  ? `${weekdays[saved.dayIndex]} • ${timeSlots[saved.timeIndex]} • ${saved.player.name}`
                  : 'Vide'}
              </p>
              <div className="save-actions">
                <button onClick={() => saveCurrentGame(slot)}>Sauvegarder</button>
                <button className="ghost" onClick={() => loadSaveSlot(slot)}>Charger</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="panel content-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Paramètres</p>
          <h2>Interface de jeu</h2>
        </div>
      </div>

      <div className="settings-list">
        <div className="setting-row">
          <span>Mode premium</span>
          <strong>On</strong>
        </div>
        <div className="setting-row">
          <span>Son</span>
          <strong>Silencieux</strong>
        </div>
        <div className="setting-row">
          <span>Qualité des effets</span>
          <strong>Élevée</strong>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeScreen) {
      case 'profile':
        return renderProfile();
      case 'inventory':
        return renderInventory();
      case 'characters':
        return renderCharacters();
      case 'journal':
        return renderJournal();
      case 'saves':
        return renderSaves();
      case 'settings':
        return renderSettings();
      default:
        return renderGameScreen();
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">C</span>
          <div>
            <p className="eyebrow">RPG narratif</p>
            <h1>CLASSROOM RP — AYANOKOJI</h1>
          </div>
        </div>

        <nav className="top-nav">
          <button className={activeScreen === 'game' ? 'active' : ''} onClick={() => setActiveScreen('game')}>
            Accueil
          </button>
          <button className={activeScreen === 'profile' ? 'active' : ''} onClick={() => setActiveScreen('profile')}>
            Profil
          </button>
          <button className={activeScreen === 'inventory' ? 'active' : ''} onClick={() => setActiveScreen('inventory')}>
            Inventaire
          </button>
          <button className={activeScreen === 'characters' ? 'active' : ''} onClick={() => setActiveScreen('characters')}>
            Personnages
          </button>
          <button className={activeScreen === 'journal' ? 'active' : ''} onClick={() => setActiveScreen('journal')}>
            Journal
          </button>
          <button className={activeScreen === 'saves' ? 'active' : ''} onClick={() => setActiveScreen('saves')}>
            Sauvegardes
          </button>
          <button className={activeScreen === 'settings' ? 'active' : ''} onClick={() => setActiveScreen('settings')}>
            Paramètres
          </button>
        </nav>
      </header>

      <main className="main-shell">
        <aside className="left-panel panel">
          <div className="panel-header small">
            <p className="eyebrow">Système</p>
            <h3>Contrôle du jeu</h3>
          </div>

          <div className="game-control">
            <button onClick={resetGame}>Nouvelle partie</button>
            <button className="ghost" onClick={() => saveCurrentGame(1)}>Sauvegarder</button>
            <button className="ghost" onClick={() => setActiveScreen('saves')}>Charger</button>
          </div>

          <div className="mini-stats-list">
            <div className="mini-stat">
              <span>Jour</span>
              <strong>{dayLabel}</strong>
            </div>
            <div className="mini-stat">
              <span>Moment</span>
              <strong>{timeLabel}</strong>
            </div>
            <div className="mini-stat">
              <span>Réputation</span>
              <strong>{game.player.reputation}</strong>
            </div>
            <div className="mini-stat">
              <span>Relation</span>
              <strong>{game.player.relationshipIndex}</strong>
            </div>
          </div>
        </aside>

        <section className="content-column">{renderContent()}</section>
      </main>

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

export default App;
