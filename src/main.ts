import './ui/styles.css';
import { createGame } from './core/setup';
import { App } from './ui/app';
import { installDialogFallbacks } from './ui/dialogs';
import { TUTORIAL } from './ui/tutorial';

installDialogFallbacks();

const app = new App();
app.onNewGame = (nation, difficulty, seed, revealMap) => {
  const game = createGame({ humanNation: nation, difficulty, seed, revealMap });
  app.start(game);
};
app.onTutorial = () => {
  const game = createGame({ humanNation: TUTORIAL.nation, difficulty: TUTORIAL.difficulty, seed: TUTORIAL.seed, revealMap: true });
  app.start(game, { tutorial: true });
};
app.menu();

// handy for debugging from the console
(window as unknown as { stratagem: App }).stratagem = app;
