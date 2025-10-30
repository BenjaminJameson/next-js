import express from "express";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const PORT = 3000; // Arbiter API port
const BASE_GAME_PORT = 7000; // starting port for games
const GAME_SERVER_PATHS = {
    2008: "C:\\RevivalServer\\RCC2008.exe",
    2011: "C:\\RevivalServer\\RCC2011.exe",
    2015: "C:\\RevivalServer\\RCC2015.exe"
};

const AUTH_KEY = "SuperSecretAuthKey123";

// In-memory storage for active game servers
const activeGames = {}; // jobId => { process, placeId, port, year }

// Generate a game server ticket
function createGameServerTicket(placeId, port) {
    return {
        ticketId: uuidv4(),
        placeId,
        port,
        issuedAt: Date.now()
    };
}

// Middleware to check authorization
function authMiddleware(req, res, next) {
    if (req.headers["pjx-arbiterauth"] !== AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

// Start a game server
app.post("/start-game-server", authMiddleware, (req, res) => {
    const { placeId, year } = req.body;
    const exePath = GAME_SERVER_PATHS[year];
    if (!exePath) return res.status(400).json({ error: "Invalid year" });

    const jobId = uuidv4();
    const port = BASE_GAME_PORT + Object.keys(activeGames).length;

    const gameProcess = spawn(exePath, [`--port=${port}`, `--place=${placeId}`], {
        stdio: ["pipe", "pipe", "pipe"]
    });

    // Listen for crash
    gameProcess.on("exit", (code, signal) => {
        console.error(`Game server ${jobId} crashed with code ${code}, signal ${signal}`);
        delete activeGames[jobId];
        // Optional: restart automatically after 3s
        setTimeout(() => {
            console.log(`Restarting game server ${jobId}...`);
            spawn(exePath, [`--port=${port}`, `--place=${placeId}`]);
        }, 3000);
    });

    activeGames[jobId] = { process: gameProcess, placeId, port, year };

    console.log(`Started game server ${jobId} for place ${placeId} on port ${port}`);
    res.json({ jobId, port, ticket: createGameServerTicket(placeId, port) });
});

// Kill a game server
app.post("/kill-game-server", authMiddleware, (req, res) => {
    const { jobId } = req.body;
    const game = activeGames[jobId];
    if (!game) return res.status(404).json({ error: "Server not found" });

    game.process.kill();
    delete activeGames[jobId];
    console.log(`Killed game server ${jobId}`);
    res.json({ success: true });
});

// Evict a player (dummy)
app.post("/evict-player", authMiddleware, (req, res) => {
    const { userId, gameId } = req.body;
    console.log(`Evict player ${userId} from game ${gameId}`);
    // Implement your player eviction logic here
    res.json({ success: true });
});

// List all active game servers
app.get("/active-games", authMiddleware, (req, res) => {
    const list = Object.entries(activeGames).map(([jobId, data]) => ({
        jobId,
        placeId: data.placeId,
        port: data.port,
        year: data.year
    }));
    res.json(list);
});

app.listen(PORT, () => console.log(`Game Arbiter running on port ${PORT}`));
