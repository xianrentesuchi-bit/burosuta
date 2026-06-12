const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

// 静的ファイルの提供（index.htmlを配置するディレクトリ）
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// オンライン上の全ゲームルーム・全プレイヤーを管理するオブジェクト
let onlinePlayers = {};
let activeBullets = {};
let activeCubes = {};
let activeSandbags = {};
let globalGameState = "SELECT";
let globalGameMode = "DUEL";

io.on("connection", (socket) => {
  console.log(`プレイヤーが接続しました: ${socket.id}`);

  // 新しいプレイヤーが入室した初期状態
  onlinePlayers[socket.id] = {
    id: socket.id,
    x: 0,
    y: 0,
    type: null,
    hp: 0,
    maxHp: 0,
    radius: 20,
    speed: 0,
    ammo: 3,
    reloadTimer: 0,
    shootCooldown: 0,
    ultCharge: 0,
    ultActive: false,
    isJumping: false,
    jumpProgress: 0,
    healTimer: 0,
    kbVx: 0,
    kbVy: 0,
    isDashing: false,
    dashAngle: 0,
    dashDistanceTraveled: 0,
    dashMaxDistance: 0,
    cubes: 0,
    longDashTimer: 0,
    facingAngle: 0,
    isBot: false,
    name: "Player"
  };

  // 現在のゲーム状態を新規接続者に同期
  socket.emit("initGameState", {
    players: onlinePlayers,
    gameMode: globalGameMode,
    gameState: globalGameState
  });

  // モード切り替えの同期
  socket.on("changeMode", (mode) => {
    globalGameMode = mode;
    socket.broadcast.emit("modeChanged", mode);
  });

  // プレイヤーがキャラクターを選択して出撃したとき
  socket.on("joinGame", (data) => {
    if (onlinePlayers[socket.id]) {
      onlinePlayers[socket.id].type = data.type;
      onlinePlayers[socket.id].x = data.x;
      onlinePlayers[socket.id].y = data.y;
      onlinePlayers[socket.id].hp = data.hp;
      onlinePlayers[socket.id].maxHp = data.maxHp;
      onlinePlayers[socket.id].radius = data.radius;
      onlinePlayers[socket.id].speed = data.speed;
      onlinePlayers[socket.id].name = data.type.name;
      
      globalGameState = "PLAYING";
      
      // 全員に通知
      io.emit("playerJoined", onlinePlayers[socket.id]);
    }
  });

  // リアルタイムの位置・ステータス更新の同期
  socket.on("updateStatus", (statusData) => {
    if (onlinePlayers[socket.id]) {
      onlinePlayers[socket.id] = { ...onlinePlayers[socket.id], ...statusData };
      // 自分以外の全員に位置変更を送信
      socket.broadcast.emit("remotePlayerUpdated", onlinePlayers[socket.id]);
    }
  });

  // 弾が発射されたときのアクション同期
  socket.on("fireBullet", (bulletData) => {
    io.emit("remoteBulletFired", bulletData);
  });

  // キューブ生成・同期
  socket.on("spawnCube", (cubeData) => {
    io.emit("remoteCubeSpawned", cubeData);
  });

  // サンドバッグ同期
  socket.on("updateSandbag", (bagData) => {
    io.emit("remoteSandbagUpdated", bagData);
  });

  // 壁破壊の同期
  socket.on("destroyWall", (wallIdx) => {
    io.emit("remoteWallDestroyed", wallIdx);
  });

  // ゲームオーバー状態の同期
  socket.on("triggerGameOver", (data) => {
    globalGameState = "GAMEOVER";
    io.emit("remoteGameOver", data);
  });

  // 切断時の処理
  socket.on("disconnect", () => {
    console.log(`プレイヤーが切断しました: ${socket.id}`);
    delete onlinePlayers[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
});
