import './ui/styles.css';
import { createGame } from './core/setup';
import { App } from './ui/app';
import { installDialogFallbacks } from './ui/dialogs';

installDialogFallbacks();

const app = new App();
app.onNewGame = (nation, difficulty, seed, revealMap) => {
  const game = createGame({ humanNation: nation, difficulty, seed, revealMap });
  app.start(game);
};
app.menu();

// handy for debugging from the console
(window as unknown as { stratagem: App }).stratagem = app;
