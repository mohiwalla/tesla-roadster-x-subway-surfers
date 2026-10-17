import "./style.css";
import { Game } from "./game";

const app = document.getElementById("app");
if (!app) throw new Error("#app container missing");

try {
  const game = new Game(app);
  game.start();
} catch (err) {
  const panel = document.createElement("div");
  panel.className = "overlay";
  const inner = document.createElement("div");
  inner.className = "menu-inner";
  const title = document.createElement("div");
  title.className = "title small";
  title.textContent = "ENGINE FAILURE";
  const msg = document.createElement("div");
  msg.className = "tagline";
  msg.textContent = "This game needs WebGL. Try a recent Chrome, Firefox, Safari or Edge.";
  const detail = document.createElement("div");
  detail.className = "credit";
  detail.textContent = String(err);
  inner.append(title, msg, detail);
  panel.appendChild(inner);
  app.appendChild(panel);
  console.error(err);
}
